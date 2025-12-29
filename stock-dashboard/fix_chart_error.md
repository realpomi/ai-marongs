`candleChartInstance.addCandlestickSeries is not a function` 에러와 차트가 비어있는 문제를 수정했습니다.

**원인 분석:**
1.  **초기 원인**: SvelteKit의 SSR 과정에서 브라우저 전용 라이브러리인 `lightweight-charts`를 가져올 때 호환성 문제 발생.
2.  **추가 원인**: `lightweight-charts` 라이브러리가 v5로 업데이트되면서 `addCandlestickSeries` 메서드가 제거되고 `addSeries` 메서드로 변경됨.

**수정 내용:**
1.  **동적 Import 적용**: `lightweight-charts`를 `await import(...)`로 동적으로 불러오도록 유지.
2.  **API 업데이트**: `addCandlestickSeries` 대신 `addSeries(CandlestickSeries, options)`를 사용하도록 코드를 수정했습니다. `CandlestickSeries`도 함께 import 했습니다.
3.  **비동기 초기화 및 정리(Cleanup) 로직 개선**: 차트 로딩이 비동기로 이루어짐에 따라, 메모리 누수를 방지하기 위한 정리(cleanup) 로직 유지.

**확인 방법:**
페이지를 새로고침하여 차트가 정상적으로 표시되는지 확인해 주세요. 이제 에러 없이 캔들 차트가 나타날 것입니다.
