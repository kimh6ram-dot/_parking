/* 도로주행 — PNG 배경 도로 템플릿(§2: 코드로 다시 그리지 않고 실제 PNG를 stage 배경으로 사용).
 * assets/02_도로주행/road_bg_sample_0N.png(863×1822, 5장 전부 동일한 도로 형태·다른 테마 스킨)에서
 * 노란 차선 픽셀을 스캔해 뽑아낸 도로 중심선/반폭을 world 좌표로 변환해 고정 배열로 저장한다
 * (스크래치패드 extract-road-path.js, 1회성 오프라인 작업 — 런타임에 PNG 픽셀을 다시 읽지 않는다.
 * "보이는 도로"는 PNG, "판정"은 이 표를 쓰는 DRIVING.roadAt() 그대로, §충돌 판정 요구사항과 일치).
 * PX_PER_UNIT=2.0 — road half≈80~89 world unit이 되도록 잡은 값(세단 폭 35 → 차선의 약 40~44%,
 * 기존 도로주행 물리/차량 스케일과 맞음).
 *
 * 2026-09-23 방향 수정: y는 "원본 이미지 아래쪽 row일수록 작다"(y = (imgPxH-row)/PX_PER_UNIT)로
 * 뽑는다 — 원래는 반대(row=0이 y=0)였는데, 그러면 렌더러가 세로 스크롤 방향을 맞추기 위해 이미지
 * 전체를 매 프레임 ctx.scale(1,-1)로 뒤집어 그려야 했고, 그 결과 스크롤 방향 자체는 맞아도 이미지
 * 안의 나무 등 비대칭 오브젝트가 통째로 상하 반전되어 보였다(실측 확인된 버그). 이 방향으로 데이터를
 * 뽑으면 renderer.js가 원본을 뒤집지 않고 그대로(top-down) 그려도 스크롤 방향이 맞는다. */
(function () {
  'use strict';

  const DRIVING = window.DRIVING;

  const PX_PER_UNIT = 2.0;
  const IMG_PX_W = 863, IMG_PX_H = 1822;

  const PATH = [
    {y:1,cx:-12.65,half:88.25},
    {y:7,cx:-13.65,half:88.75},
    {y:15,cx:-14.75,half:88.65},
    {y:23,cx:-15.25,half:88.4},
    {y:31,cx:-15.9,half:88.25},
    {y:39,cx:-16,half:88.4},
    {y:47,cx:-15.75,half:88.65},
    {y:55,cx:-14.9,half:88.75},
    {y:63,cx:-13.75,half:88.65},
    {y:71,cx:-12.65,half:88.75},
    {y:79,cx:-11.15,half:89},
    {y:87,cx:-9.15,half:88.75},
    {y:95,cx:-7.15,half:88.75},
    {y:103,cx:-4.9,half:88.75},
    {y:111,cx:-2.65,half:88.75},
    {y:119,cx:-0.25,half:88.65},
    {y:127,cx:2.6,half:88.5},
    {y:135,cx:5,half:88.65},
    {y:143,cx:7.5,half:88.4},
    {y:151,cx:10.25,half:88.4},
    {y:159,cx:12.6,half:88.25},
    {y:167,cx:15.1,half:88},
    {y:175,cx:17.5,half:88.15},
    {y:183,cx:19.85,half:87.75},
    {y:191,cx:21.75,half:87.9},
    {y:199,cx:24,half:87.4},
    {y:207,cx:25.75,half:87.4},
    {y:215,cx:27.6,half:87},
    {y:223,cx:29.1,half:87},
    {y:231,cx:30.35,half:86.5},
    {y:239,cx:31.5,half:86.4},
    {y:247,cx:32.35,half:86.25},
    {y:255,cx:33.25,half:86.4},
    {y:263,cx:33.25,half:86.15},
    {y:271,cx:33.5,half:85.9},
    {y:279,cx:33.25,half:86.15},
    {y:287,cx:33,half:85.85},
    {y:295,cx:32.25,half:86.1},
    {y:303,cx:31.25,half:85.85},
    {y:311,cx:30.35,half:86},
    {y:319,cx:29,half:86.15},
    {y:327,cx:27.35,half:86.25},
    {y:335,cx:25.25,half:86.6},
    {y:343,cx:23.1,half:86.75},
    {y:351,cx:20.6,half:86.75},
    {y:359,cx:17.85,half:87},
    {y:367,cx:15.35,half:87.25},
    {y:375,cx:12.1,half:87.25},
    {y:383,cx:9.1,half:87.25},
    {y:391,cx:6,half:86.9},
    {y:399,cx:2.75,half:86.9},
    {y:407,cx:-0.5,half:86.4},
    {y:415,cx:-3.65,half:86},
    {y:423,cx:-6.9,half:85.5},
    {y:431,cx:-9.9,half:85},
    {y:439,cx:-12.5,half:84.65},
    {y:447,cx:-14.9,half:84},
    {y:455,cx:-17.25,half:83.9},
    {y:463,cx:-19.4,half:83.5},
    {y:471,cx:-21,half:83.4},
    {y:479,cx:-22.4,half:83.25},
    {y:487,cx:-23.5,half:83.15},
    {y:495,cx:-24.4,half:83},
    {y:503,cx:-24.75,half:82.9},
    {y:511,cx:-25.15,half:83.25},
    {y:519,cx:-25.15,half:83.25},
    {y:527,cx:-24.75,half:83.15},
    {y:535,cx:-24.25,half:83.65},
    {y:543,cx:-22.9,half:84},
    {y:551,cx:-21.75,half:84.4},
    {y:559,cx:-20.4,half:84.5},
    {y:567,cx:-18.9,half:85},
    {y:575,cx:-17.15,half:85.25},
    {y:583,cx:-15.15,half:85.75},
    {y:591,cx:-13.15,half:85.75},
    {y:599,cx:-10.9,half:86},
    {y:607,cx:-8.75,half:86.15},
    {y:615,cx:-6.65,half:86.25},
    {y:623,cx:-4.25,half:86.15},
    {y:631,cx:-2.15,half:86},
    {y:639,cx:-0.25,half:85.9},
    {y:647,cx:2.1,half:85.75},
    {y:655,cx:3.85,half:85.25},
    {y:663,cx:5.75,half:85.15},
    {y:671,cx:7.75,half:85.15},
    {y:679,cx:9.6,half:84.75},
    {y:687,cx:11.1,half:84.5},
    {y:695,cx:12.6,half:84.25},
    {y:703,cx:14,half:84.15},
    {y:711,cx:15,half:83.9},
    {y:719,cx:16,half:83.9},
    {y:727,cx:16.75,half:83.9},
    {y:735,cx:17.6,half:83.5},
    {y:743,cx:18.1,half:83},
    {y:751,cx:18.35,half:82.75},
    {y:759,cx:18.6,half:82.5},
    {y:767,cx:18.6,half:82.5},
    {y:775,cx:18.5,half:82.4},
    {y:783,cx:18.25,half:82.35},
    {y:791,cx:17.75,half:82.35},
    {y:799,cx:17,half:81.9},
    {y:807,cx:16.1,half:81.75},
    {y:815,cx:15.35,half:81.5},
    {y:823,cx:14.35,half:81.75},
    {y:831,cx:13.5,half:81.6},
    {y:839,cx:12.1,half:81.25},
    {y:847,cx:11,half:81.1},
    {y:855,cx:10,half:81.15},
    {y:863,cx:8.6,half:80.75},
    {y:871,cx:7.35,half:80.5},
    {y:879,cx:5.75,half:80.4},
    {y:887,cx:4.35,half:80.25},
    {y:895,cx:3.25,half:80.4},
    {y:903,cx:1.5,half:80.15},
    {y:911,cx:0,half:79.9},
  ];

  /* 원본 이미지 row=0(맨 위, world_y=worldH에 대응) 지점 도로 중심 픽셀(426.8px, 원본 이미지
   * 좌표) — PATH의 cx는 이 값을 뺀 상대값이라, 이미지를 그릴 때 "이미지 0번 열이 world의 어느
   * x인지" 역산하려면 이 오프셋이 다시 필요하다(가로 정렬 기준이라 방향 수정과 무관, 그대로 유지). */
  const CX0_PX = 426.8;

  DRIVING.ROAD_TEMPLATE = {
    pxPerUnit: PX_PER_UNIT,
    imgPxW: IMG_PX_W, imgPxH: IMG_PX_H,
    worldW: IMG_PX_W / PX_PER_UNIT, worldH: IMG_PX_H / PX_PER_UNIT,
    imgOriginWorldX: -CX0_PX / PX_PER_UNIT, // 이미지 0번 열(왼쪽 끝)의 world x
    path: PATH,
  };

  /* bgKey: DRIVING_ROAD_BG의 키('urban'|'residential'|'park'|'riverside'|'mountain').
   * destLen: 목적지 존 길이(코스 마지막 destLen만큼을 목적지 구간으로 사용, 기존 course()와 동일 패턴).
   * widthMul: 5 스테이지가 전부 같은 실사 도로 곡선(PATH)을 공유하는 대신(2026-09-29 사용자 확정 —
   * 실제 제작하신 배경 그림을 그대로 쓰기로 함) 난이도는 이 폭 배율로만 차별화한다(§8). half에만
   * 곱하고 cx/곡선 형태는 절대 건드리지 않는다 — 원본 배열(PATH)을 공유 mutate하지 않도록 매번 새
   * 배열을 만든다(스테이지마다 다른 배율을 동시에 써야 하므로). */
  DRIVING.buildImageCourse = function (bgKey, destLen, widthMul) {
    const mul = widthMul == null ? 1 : widthMul;
    const road = mul === 1 ? PATH : PATH.map(p => ({ y: p.y, cx: p.cx, half: p.half * mul }));
    const end = road[road.length - 1];
    const destination = { y0: end.y - (destLen || 120), y1: end.y, cx: end.cx, half: end.half };
    return { road, destination, totalLen: end.y, bgImage: bgKey };
  };
})();
