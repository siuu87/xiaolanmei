"""忌口 / 过敏源：从聊天主站读档案、判断一道菜命中了什么、以及给出替代建议。

**档案本体不在这里维护。** 主站在 `/api/diet/profile` 出（它从人设变量和备忘录里解析出来），
这里只做三件事：
  1. `fetch_profile()`  把主站那份拿过来（拿不到就返回 None，由调用方用本地缓存兜底）
  2. `hits()`           一道菜的菜名 / 食材命中了哪些条目
  3. `suggest()`        让模型说这道菜里被命中的东西能换成什么

硬规则（和主站 `后端/src/diet/` 一致）：**代码里不许出现任何具体食物名**。
条目一律从档案里来；档案是空的就什么都不显示，绝不填默认值。
"""
from __future__ import annotations

import json
import os
import re

import httpx

from . import llm

# 主站地址。小食谱独立跑的时候读不到也不影响用，只是没有忌口标注。
CHAT_BASE = (os.environ.get('CHAT_BASE_URL') or 'http://127.0.0.1:3001').rstrip('/')


async def fetch_profile(timeout: float = 3.0) -> dict | None:
    """主站那份忌口档案。连不上 / 主站没起 → None（调用方别把 None 当空档案用）。"""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=1.5)) as cl:
            r = await cl.get(CHAT_BASE + '/api/diet/profile')
            if r.status_code != 200:
                return None
            d = r.json()
    except Exception:
        return None
    if not isinstance(d, dict):
        return None
    return {'dislikes': [str(x) for x in (d.get('dislikes') or []) if str(x).strip()][:60],
            'allergies': [str(x) for x in (d.get('allergies') or []) if str(x).strip()][:60]}


def is_empty(profile: dict | None) -> bool:
    return not profile or not (profile.get('dislikes') or profile.get('allergies'))


def hits(texts: list[str], profile: dict | None) -> list[dict]:
    """命中检测。texts 传这道菜的菜名 + 每条食材 + 描述。

    返回 `[{name, level, where}]`，过敏排前面；同一条目只报一次，`where` 是命中的那句话，
    好让人看出是「洋葱」还是「洋葱炒蛋」这种误报。
    """
    if is_empty(profile):
        return []
    blocks = [t for t in texts if t]
    if not blocks:
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for level, key in (('allergy', 'allergies'), ('dislike', 'dislikes')):
        for name in profile.get(key) or []:
            n = name.strip()
            if not n or n.lower() in seen:
                continue
            for t in blocks:
                if n.lower() in t.lower():
                    seen.add(n.lower())
                    out.append({'name': n, 'level': level, 'where': t.strip()[:28]})
                    break
    return out


def texts_of(name: str = '', dish: str = '', ings: list | None = None, descr: str = '') -> list[str]:
    return [name or '', dish or ''] + [str(x) for x in (ings or [])] + [descr or '']


# ------------------------------- 替代建议 -------------------------------

_SUB_SYS = """你在帮人改一道菜。菜谱里用到了这个人要避开的东西，你的活儿是给出**能直接替换**的食材。

要求：
- 每样给 1–2 个替代，用 / 分隔，每个 2–6 个字
- 必须是真实存在的常见食材，换了之后这道菜还成立（别给风马牛不相及的）
- 过敏的那几样，宁可给「不放，靠 XX 提味」这种方案，不要给「挑掉就行」
- 想不出合适的就写「建议换一道」
- 只回一个 JSON 对象，键是原食材名，值是替代方案；不要解释、不要代码块围栏、不要多余的字"""


def _sub_system(profile: dict) -> tuple[str, str]:
    """拼 system + user。用户档案的内容一律当数据传，不写进指令里。"""
    dish = profile.get('dish') or ''
    cuisine = profile.get('cuisine') or ''
    items = profile.get('items') or []
    lines = [f'菜名：{dish}' + (f'（{cuisine}）' if cuisine else '')]
    if profile.get('ings'):
        lines.append('用料：' + '、'.join(profile['ings'][:18]))
    lines.append('要换掉的：' + '、'.join(
        f"{x['name']}（{'过敏，硬性不能出现' if x.get('level') == 'allergy' else '忌口，能换就换'}）" for x in items))
    return _SUB_SYS, '\n'.join(lines)


def _parse_subs(raw: str, wanted: list[str]) -> dict[str, str]:
    """从模型回复里抠出 {原食材: 替代}。只认真的问过的那几个键。"""
    text = (raw or '').strip()
    text = re.sub(r'^```(?:json)?|```$', '', text, flags=re.M).strip()
    m = re.search(r'\{[\s\S]*\}', text)
    out: dict[str, str] = {}
    if m:
        try:
            d = json.loads(m.group(0))
            if isinstance(d, dict):
                for k, v in d.items():
                    k2, v2 = str(k).strip(), str(v).strip()
                    if k2 in wanted and v2:
                        out[k2] = v2[:40]
        except Exception:
            pass
    if out:
        return out
    # 模型没给 JSON，退一步按「原食材：替代」逐行认
    for line in text.splitlines():
        for name in wanted:
            if name in line and name not in out:
                tail = line.split(name, 1)[1].lstrip(' :：>-→=')
                tail = re.sub(r'^可?(以)?(换成|换成|换|替代为|用)\s*', '', tail).strip(' 。.;；')
                if tail and len(tail) <= 40 and not tail.startswith(name):
                    out[name] = tail
    return out


async def suggest(dish: str, cuisine: str, ings: list[str], matched: list[dict]) -> tuple[dict[str, str], str]:
    """返回 ({原食材: 替代}, 错误说明)。模型没配 / 出错时给空 dict + 一句话，前端就只显示命中、不显示替代。"""
    if not matched:
        return {}, ''
    wanted = [x['name'] for x in matched]
    system, user = _sub_system({'dish': dish, 'cuisine': cuisine, 'ings': ings, 'items': matched})
    try:
        raw = await llm.complete(system, user, timeout=25.0)
    except llm.NotConfigured:
        return {}, '没有配置模型'
    except llm.ModelError as e:
        return {}, str(e)
    except Exception as e:  # noqa: BLE001 - 兜底，别让替代建议把整张卡片带崩
        return {}, f'模型出错 ({type(e).__name__})'
    return _parse_subs(raw, wanted), ''
