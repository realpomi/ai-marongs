"""PostgreSQL 커넥션 풀 및 쿼리 테스트."""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from config import Settings
from db import init_pool, close_pool, execute_query, execute_one, execute_command, get_connection


def test_connection():
    """DB 연결 테스트."""
    settings = Settings.from_env()
    print(f"DSN: {settings.db_dsn}")

    # 풀 초기화
    init_pool(settings.db_dsn, minconn=1, maxconn=5)
    print("✓ 커넥션 풀 초기화 성공")

    # 버전 확인
    result = execute_one("SELECT version()")
    if result:
        print(f"✓ PostgreSQL 버전: {result[0][:50]}...")

    # 현재 시간 확인
    result = execute_one("SELECT NOW()")
    if result:
        print(f"✓ 현재 시간: {result[0]}")

    # 테이블 목록 확인
    tables = execute_query(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
        """
    )
    print(f"✓ 테이블 목록: {[t[0] for t in tables]}")

    # 풀 종료
    close_pool()
    print("✓ 커넥션 풀 종료 완료")


def test_stock_prices_table():
    """stock_prices 테이블 테스트."""
    settings = Settings.from_env()
    init_pool(settings.db_dsn)

    # 테이블 존재 확인
    result = execute_one(
        """
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'stock_prices'
        )
        """
    )

    if result and result[0]:
        print("✓ stock_prices 테이블 존재")

        # 데이터 개수 확인
        count = execute_one("SELECT COUNT(*) FROM stock_prices")
        print(f"✓ 총 레코드 수: {count[0]}")

        # 최근 데이터 조회
        recent = execute_query(
            """
            SELECT symbol, price, price_time
            FROM stock_prices
            ORDER BY price_time DESC
            LIMIT 5
            """
        )
        print("✓ 최근 5건:")
        for row in recent:
            print(f"  - {row[0]}: {row[1]:,.0f}원 ({row[2]})")
    else:
        print("✗ stock_prices 테이블이 없습니다")

    close_pool()


if __name__ == "__main__":
    print("=" * 50)
    print("PostgreSQL 연결 테스트")
    print("=" * 50)

    try:
        test_connection()
        print()
        test_stock_prices_table()
        print()
        print("모든 테스트 통과!")
    except Exception as e:
        print(f"✗ 오류 발생: {e}")
        sys.exit(1)
