.PHONY: help add-ticker update-ticker deactivate-ticker list-tickers update collect-60m collect-daily yf-collect-60m yf-collect-daily yf-collect tiingo-collect-60m tiingo-collect-daily tiingo-collect

help:
	@echo "사용 가능한 명령어:"
	@echo ""
	@echo "=== 티커 관리 ==="
	@echo "  make add-ticker SYMBOL=AAPL EXCHANGE=NAS NAME='Apple Inc.'  - 티커 등록 (1년치 일봉 자동 수집)"
	@echo "  make update-ticker SYMBOL=AAPL EXCHANGE=NYS NAME='Apple'    - 티커 수정"
	@echo "  make deactivate-ticker SYMBOL=AAPL                          - 티커 비활성화"
	@echo "  make list-tickers                                           - 활성 티커 조회"
	@echo "  make update SYMBOL=AAPL                                     - 1년치 일봉 업데이트"
	@echo ""
	@echo "=== KIS API (한국투자증권) ==="
	@echo "  make collect-60m                                            - 60분봉 수집"
	@echo "  make collect-daily                                          - 일봉 수집"
	@echo ""
	@echo "=== yfinance (시간외 데이터 포함) ==="
	@echo "  make yf-collect-60m                                         - 60분봉 수집 (프리마켓/애프터마켓 포함)"
	@echo "  make yf-collect-60m PERIOD=1d                               - 60분봉 수집 (기간 지정)"
	@echo "  make yf-collect-60m NO_EXTENDED=1                           - 60분봉 수집 (시간외 제외)"
	@echo "  make yf-collect-daily                                       - 일봉 수집"
	@echo "  make yf-collect-daily PERIOD=3mo                            - 일봉 수집 (기간 지정)"
	@echo "  make yf-collect SYMBOL=AAPL                                 - 단일 종목 60분봉 수집"
	@echo "  make yf-collect SYMBOL=AAPL INTERVAL=daily                  - 단일 종목 일봉 수집"
	@echo ""
	@echo "=== Tiingo (무료 티어, 시간외 데이터 포함) ==="
	@echo "  make tiingo-collect-60m                                     - 60분봉 수집 (프리마켓/애프터마켓 포함)"
	@echo "  make tiingo-collect-60m DAYS=3                              - 60분봉 수집 (기간 지정, 최대 5일)"
	@echo "  make tiingo-collect-60m NO_EXTENDED=1                       - 60분봉 수집 (시간외 제외)"
	@echo "  make tiingo-collect-daily                                   - 일봉 수집"
	@echo "  make tiingo-collect-daily DAYS=60                           - 일봉 수집 (기간 지정)"
	@echo "  make tiingo-collect SYMBOL=AAPL                             - 단일 종목 60분봉 수집"
	@echo "  make tiingo-collect SYMBOL=AAPL INTERVAL=daily              - 단일 종목 일봉 수집"

# 티커 등록
add-ticker:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make add-ticker SYMBOL=AAPL EXCHANGE=NAS NAME='Apple Inc.')
endif
	@python scripts/cli.py add-ticker $(SYMBOL) $(if $(EXCHANGE),-e $(EXCHANGE)) $(if $(NAME),-n '$(NAME)')

# 티커 수정
update-ticker:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make update-ticker SYMBOL=AAPL EXCHANGE=NYS NAME='Apple')
endif
	@python scripts/cli.py update-ticker $(SYMBOL) $(if $(EXCHANGE),-e $(EXCHANGE)) $(if $(NAME),-n '$(NAME)')

# 티커 비활성화
deactivate-ticker:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make deactivate-ticker SYMBOL=AAPL)
endif
	@python scripts/cli.py deactivate-ticker $(SYMBOL)

# 활성 티커 조회
list-tickers:
	@python scripts/cli.py list-tickers

# 1년치 일봉 업데이트
update:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make update SYMBOL=AAPL)
endif
	@python scripts/cli.py update $(SYMBOL)

# 60분봉 수집
collect-60m:
	@python scripts/cli.py collect-60m

# 일봉 수집
collect-daily:
	@python scripts/cli.py collect-daily

# yfinance 60분봉 수집 (시간외 포함)
yf-collect-60m:
	@python scripts/cli.py yf-collect-60m $(if $(PERIOD),-p $(PERIOD)) $(if $(NO_EXTENDED),--no-extended)

# yfinance 일봉 수집
yf-collect-daily:
	@python scripts/cli.py yf-collect-daily $(if $(PERIOD),-p $(PERIOD))

# yfinance 단일 종목 수집
yf-collect:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make yf-collect SYMBOL=AAPL)
endif
	@python scripts/cli.py yf-collect $(SYMBOL) $(if $(INTERVAL),-i $(INTERVAL)) $(if $(PERIOD),-p $(PERIOD)) $(if $(NO_EXTENDED),--no-extended)

# Tiingo 60분봉 수집 (시간외 포함)
tiingo-collect-60m:
	@python scripts/cli.py tiingo-collect-60m $(if $(DAYS),-d $(DAYS)) $(if $(NO_EXTENDED),--no-extended)

# Tiingo 일봉 수집
tiingo-collect-daily:
	@python scripts/cli.py tiingo-collect-daily $(if $(DAYS),-d $(DAYS))

# Tiingo 단일 종목 수집
tiingo-collect:
ifndef SYMBOL
	$(error SYMBOL is required. Usage: make tiingo-collect SYMBOL=AAPL)
endif
	@python scripts/cli.py tiingo-collect $(SYMBOL) $(if $(INTERVAL),-i $(INTERVAL)) $(if $(DAYS),-d $(DAYS)) $(if $(NO_EXTENDED),--no-extended)
