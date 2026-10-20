# -*- coding: utf-8 -*-
"""把菜谱库里的菜品数打到 stdout，库还没建好就打印 0。

给 scripts/setup-recipe-nook.bat 用的：批处理里拼多行 Python 太容易被引号
和 cmd 的转义搞坏，所以数数这件事单独放一个脚本，bat 只负责重定向到文件再
set /p 读回来。顺带它也能当人工排查用的小工具：

    python scripts/count_recipes.py
"""
import os
import sqlite3
import sys

DATA = os.environ.get('FOOD_DATA_DIR') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
DB = os.path.join(DATA, 'recipes.db')


def count():
    if not os.path.exists(DB):
        return 0
    con = sqlite3.connect(DB)
    try:
        has = con.execute(
            "select count(*) from sqlite_master where type='table' and name='recipes'"
        ).fetchone()[0]
        if not has:
            return 0
        return con.execute('select count(*) from recipes').fetchone()[0] or 0
    finally:
        con.close()


def main():
    print(count())
    return 0


if __name__ == '__main__':
    sys.exit(main())
