.PHONY: help add-ticker update-ticker deactivate-ticker list-tickers collect-60m collect-daily

help:
	@echo "사용 가능한 명령어:"
	@echo "  make add-ticker SYMBOL=AAPL EXCHANGE=NAS NAME='Apple Inc.'  - 티커 등록"
	@echo "  make update-ticker SYMBOL=AAPL EXCHANGE=NYS NAME='Apple'    - 티커 수정"
	@echo "  make deactivate-ticker SYMBOL=AAPL                          - 티커 비활성화"
	@echo "  make list-tickers                                           - 활성 티커 조회"
	@echo "  make collect-60m                                            - 60분봉 수집"
	@echo "  make collect-daily                                          - 일봉 수집"

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

# 60분봉 수집
collect-60m:
	@python scripts/cli.py collect-60m

# 일봉 수집
collect-daily:
	@python scripts/cli.py collect-daily
