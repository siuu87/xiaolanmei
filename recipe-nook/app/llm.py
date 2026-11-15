"""估热量 / 看照片用的模型: 任何 OpenAI 兼容的 /chat/completions 都行(官方、各家中转、本地 Ollama/vLLM)。
用便宜的小模型就够, 它只需要吐一行 JSON; 看照片那个得是能看图的模型。

环境变量:
  LLM_BASE_URL  比如 https://api.openai.com/v1 或 http://127.0.0.1:11434/v1 (要带 /v1 这一截)
  LLM_API_KEY   没有就留空
  LLM_MODEL     模型名
  VISION_MODEL  可选, 看照片单独用一个 (不设就沿用 LLM_MODEL)
"""
from __future__ import annotations
import os

import httpx


class NotConfigured(RuntimeError):
    pass


class ModelError(RuntimeError):
    """模型服务那边的问题: 连不上 / key 不对 / 没有这个模型 / 报错。消息是给人看的一句话。"""


async def _post(base: str, model: str, key: str, payload: dict, timeout: float) -> str:
    headers = {'Authorization': f'Bearer {key}'} if key else {}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=12.0)) as cl:
            r = await cl.post(base + '/chat/completions', json=payload, headers=headers)
    except httpx.TimeoutException:
        raise ModelError('模型一直没回话, 超时了')
    except httpx.HTTPError as e:
        raise ModelError(f'连不上模型服务 ({type(e).__name__}), 检查 LLM_BASE_URL')
    if r.status_code in (401, 403):
        raise ModelError('模型服务不认这个 key (HTTP %d), 检查 LLM_API_KEY' % r.status_code)
    if r.status_code == 404:
        raise ModelError('模型服务说没有「%s」这个模型 (HTTP 404), 检查 LLM_MODEL' % model)
    if r.status_code >= 400:
        raise ModelError('模型服务报错 HTTP %d' % r.status_code)
    try:
        msg = (r.json().get('choices') or [{}])[0].get('message') or {}
    except Exception:
        raise ModelError('模型返回的不是 JSON')
    return msg.get('content') or ''


async def complete(system: str, user: str, timeout: float = 40.0) -> str:
    base = (os.environ.get('LLM_BASE_URL') or '').rstrip('/')
    model = os.environ.get('LLM_MODEL') or ''
    key = os.environ.get('LLM_API_KEY') or ''
    if not base or not model:
        raise NotConfigured('LLM_BASE_URL / LLM_MODEL 没设')
    payload = {'model': model, 'temperature': 0.2, 'max_tokens': 300,
               'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]}
    return await _post(base, model, key, payload, timeout)


async def complete_vision(system: str, user: str, images: list[str], timeout: float = 90.0, max_tokens: int = 700) -> str:
    """看图。images 里是 data URL(data:image/jpeg;base64,...) 或可访问的 http 图片地址。

    模型默认沿用 LLM_MODEL; 想文字用便宜的、看图用另一个, 就设 VISION_MODEL。
    """
    base = (os.environ.get('LLM_BASE_URL') or '').rstrip('/')
    model = (os.environ.get('VISION_MODEL') or os.environ.get('LLM_MODEL') or '')
    key = os.environ.get('LLM_API_KEY') or ''
    if not base or not model:
        raise NotConfigured('LLM_BASE_URL / LLM_MODEL 没设')
    if not images:
        raise ValueError('没有图片')
    content: list[dict] = [{'type': 'text', 'text': user}]
    for u in images:
        content.append({'type': 'image_url', 'image_url': {'url': u}})
    payload = {'model': model, 'temperature': 0.1, 'max_tokens': max_tokens,
               'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': content}]}
    return await _post(base, model, key, payload, timeout)
