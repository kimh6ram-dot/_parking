/* 도로주행 — ROAD segment 조합 시스템 (2026-09-29 신규, 모듈형 맵)
 * courseData(타입 이름 배열) → buildCourseFromSegments() → 월드 좌표에 고정 배치된 segment
 * 목록 + 기존 DRIVING.roadAt()/computeStageCamX()(config.js)와 100% 호환되는 stage.road
 * 웨이포인트 배열. 레거시(stages.js의 course()/buildImageCourse())와 완전히 분리된 새
 * 함수 — 기존 함수는 하나도 건드리지 않는다.
 *
 * world 오브젝트 규칙(§5): 한번 계산된 segment의 worldX/worldY는 이후 절대 바뀌지 않는다.
 * 카메라나 플레이어 위치에 맞춰 재중앙화하지 않는다 — 이 파일은 좌표를 "만들기만" 하고, 그
 * 좌표를 화면으로 바꾸는 건 카메라 쪽(renderer.js worldToScreen)의 책임이다. */
(function () {
  'use strict';
  const DRIVING = window.DRIVING;

  /* entry/exit anchor 연결(§4): previous.exitWorldX === next.entryWorldX가 world 좌표에서
   * 정확히 성립하도록 각 segment의 로컬→월드 X 오프셋(offsetX)을 계산한다. 세로는 세그먼트
   * 높이만큼 단순 누적. */
  function buildRoadSegments(courseData, startWorldX) {
    const RA = DRIVING.roadAssets;
    const segs = [];
    let worldY = 0;
    let prevExitWorldX = startWorldX != null ? startWorldX : 0;

    courseData.forEach((item, i) => {
      const typeName = typeof item === 'string' ? item : item.type;
      const meta = RA.SEGMENT_TYPES[typeName];
      if (!meta) throw new Error('알 수 없는 road segment 타입: ' + typeName);

      const offsetX = prevExitWorldX - meta.entryX; // localX + offsetX = worldX
      const entryWorldX = meta.entryX + offsetX;    // === prevExitWorldX (연결 불변식)
      const exitWorldX = meta.exitX + offsetX;

      segs.push({
        index: i, type: typeName, asset: meta.asset, sidewalkAsset: meta.sidewalkAsset || null,
        worldY0: worldY, worldY1: worldY + meta.height,   // y0=entry(뒤), y1=exit(앞)
        offsetX,
        entryWorldX, exitWorldX,
        entryHalf: meta.entryHalf, exitHalf: meta.exitHalf,
        widthPx: meta.width, heightPx: meta.height,
      });

      worldY += meta.height;
      prevExitWorldX = exitWorldX;
    });

    return segs;
  }

  /* 기존 DRIVING.roadAt(stage,y)(config.js, smoothstep 보간)와 그대로 호환되는 dense
   * waypoint 배열을 만든다. 실측 결과 세그먼트 내부의 x 이동이 선형이므로(road-assets.js
   * 주석 참고), 촘촘히(SAMPLE_STEP 간격) 샘플링하면 smoothstep 보간도 선형과 사실상
   * 구분되지 않아 "시각(PNG)"과 "판정(roadAt)"이 어긋나지 않는다(§20) — roadAt() 자체는
   * 수정하지 않고 입력 데이터만 촘촘하게 만드는 쪽을 택해 physics/obstacles/scoring/camera
   * 어떤 기존 파일도 손대지 않는다. */
  const SAMPLE_STEP = 16;
  function segmentsToRoad(segs) {
    const pts = [];
    segs.forEach(seg => {
      const n = Math.max(1, Math.round(seg.heightPx / SAMPLE_STEP));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const worldY = seg.worldY0 + t * seg.heightPx;
        const cx = seg.entryWorldX + (seg.exitWorldX - seg.entryWorldX) * t;
        const half = seg.entryHalf + (seg.exitHalf - seg.entryHalf) * t;
        if (pts.length && pts[pts.length - 1].y === worldY) continue; // 세그먼트 경계 중복점 제거
        pts.push({ y: worldY, cx, half });
      }
    });
    return pts;
  }

  /* courseData → {segments, road, destination, totalLen} — stages.js가 legacy course()/
   * buildImageCourse() 대신 STAGE 1~2에 이걸 호출한다. destLen만큼을 결승선 존으로 쓴다.
   *
   * bufferLen(world unit, 기본 0): courseData 배열 맨 끝에 순수 시각적 버퍼 세그먼트(보통
   * 'straight' 1~2개)를 추가로 붙였을 때, "결승선(destination)은 그 버퍼 앞에서 끝나고
   * 버퍼는 도로만 계속 이어지는 여분 구간"으로 취급하기 위한 옵션이다(2026-09-30 — 실측:
   * 결승선 = road/roadSegments 배열의 맨 끝이라 도착 직전 화면 앞쪽이 회색 배경으로
   * 비어 보이는 문제가 있었다. road-segments.js 자체는 "세그먼트 개수 × 세그먼트 높이"로
   * 월드 길이를 정하는 구조라(§19) 결승선 이후에도 진짜 도로 데이터가 필요했다 — 버퍼도
   * 똑같은 세그먼트 시스템으로 만들어서 이 문제를 근본적으로 없앤다, 페이드/즉석 생성 없음). */
  function buildCourseFromSegments(courseData, startWorldX, destLen, bufferLen) {
    const segments = buildRoadSegments(courseData, startWorldX);
    const road = segmentsToRoad(segments);
    const end = road[road.length - 1];
    const finishY = end.y - (bufferLen || 0);
    const finishPt = (bufferLen || 0) > 0 ? DRIVING.roadAt({ road: road }, finishY) : end;
    const destination = { y0: finishY - (destLen || 120), y1: finishY, cx: finishPt.cx, half: finishPt.half };
    return { segments, road, destination, totalLen: end.y };
  }

  DRIVING.buildRoadSegments = buildRoadSegments;
  DRIVING.segmentsToRoad = segmentsToRoad;
  DRIVING.buildCourseFromSegments = buildCourseFromSegments;
})();
