# Track Spec: 주식 데이터 수집 고도화 및 AI 분석 리포트 생성 기본 파이프라인 구축

## Overview
이 트랙은 20~30개 종목에 대한 주식 데이터를 안정적으로 수집하고, 이를 바탕으로 Gemini AI를 활용하여 분석 리포트를 생성한 뒤 Discord로 전송하는 전체 파이프라인의 기반을 구축합니다.

## Goals
- 20~30개 종목 리스트 관리 및 데이터 수집 최적화
- NATS를 통한 서비스 간 데이터 연동 (Stock Crawler -> Message Processor)
- Message Processor에서 Gemini API를 호출하여 종목 분석 리포트 생성
- 생성된 리포트를 Discord 봇을 통해 사용자에게 전송

## Requirements
- Stock Crawler: 데이터 수집 종목 설정 기능 및 DB 저장 로직 강화
- Message Processor: NATS 메시지 수신 및 AI 분석 요청 로직 구현
- Gemini API: 종목 데이터를 입력받아 프롬프트 기반 리포트 생성 (Markdown 서식 준수)
- Discord Bot: 리포트 수신 및 사용자 채널 전송 기능
