# 摄像头真人验收记录

日期：2026-08-28（Asia/Shanghai）

## 已实际通过

- 浏览器摄像头权限已授权，状态为“测试中，本地分析”。
- MediaPipe Face Landmarker 模型已在本地加载。
- 真人当前状态读数：人在场、朝向屏幕、眼睛睁开、未检测到哈欠候选。
- 人脸稳定约 0.9 秒后记录 `FACE_PRESENT`。
- 随后每 5 秒记录 `ACTIVITY_SAMPLE`。
- `CAMERA_TEST_STARTED` 明确记录 `raw_video_uploaded=false`。
- 真人睁眼分数约为 `0.12–0.23`，闭眼稳定分数约为 `0.59–0.65`。
- 连续闭眼超过 0.8 秒后成功记录 `EYES_CLOSED_CANDIDATE`；短暂高分但未持续 0.8 秒的眨眼没有生成事件。
- 真人向右偏头持续 3.2 秒后成功记录 `HEAD_AWAY_CANDIDATE direction=right`，回正后记录 `HEAD_RETURNED`。

## 已修正但仍需动作验收

预览使用自拍镜像，而模型坐标来自原始视频，因此原来的左右文字方向相反。现已交换模型 x 轴到用户自身左右方向的映射。

以下项目必须由真人实际完成动作后才能确认，不能仅靠代码检查宣称通过：

1. 向用户自己的左侧偏头并保持 3 秒，预期显示“向左偏离”并记录 `HEAD_AWAY_CANDIDATE direction=left`。
2. 明显张嘴保持约 1.5 秒，预期记录 `YAWN_CANDIDATE`。
3. 离开画面 3 秒，预期记录 `FACE_MISSING_CANDIDATE`；离开 30 秒才记录 `FACE_ABSENT_CONFIRMED`。

这些候选事件只提供证据，均不会单独触发红灯。
