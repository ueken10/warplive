/**
 * WarpLive - config.js
 * 定数・設定値の一元管理
 *
 * Phase 1: 空枠（後続フェーズで随時追加）
 */

/** @type {string} Gemini Live API WebSocket URL */
export const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** @type {string} Gemini Live API モデル名
 *
 * gemini-3.1-flash-live-preview を採用。
 * 従来の gemini-2.5-flash-native-audio-latest より新しい世代で、
 * デフォルトの thinkingLevel が 'minimal'（レイテンシ最小化最適化済み）。
 * 応答レイテンシの改善が主目的。
 */
export const GEMINI_MODEL = "models/gemini-3.1-flash-live-preview";

/** @type {number} VADの無音検出時間（ミリ秒）
 *
 * ユーザー発話終了後、この時間だけ無音が続くとAI応答を開始する。
 * サーバー内部デフォルトは約800ms。500msに短縮して応答開始を高速化。
 * 推奨範囲は500〜800ms。低すぎると発話途切れで応答が分割されるリスク。
 */
export const VAD_SILENCE_DURATION_MS = 500;

/** @type {number} VADのプレフィックスパディング（ミリ秒）
 *
 * 発話検出前に含める音声の量。発話先頭の切り捨てを防ぐ。
 */
export const VAD_PREFIX_PADDING_MS = 20;

/** @type {number} アイドルタイムアウト（秒）。この秒数ユーザー発話がない場合セッション切断 */
export const IDLE_TIMEOUT_SEC = 30;

/** @type {number} WebSocket接続失敗時のリトライ待機時間（ミリ秒） */
export const RECONNECT_DELAY_MS = 5000;

/**
 * 言語別ウェイクワードマッピング
 * ※アバター共通。アバター切替時はウェイクワードを変更しない。
 * @type {Object<string, string[]>}
 */
export const WAKE_WORDS_BY_LANG = {
  "ja-JP": ["もしもし", "こんにちは"],
  "en-US": ["Hey", "Hello"],
};

/**
 * アバター別設定
 *
 * @typedef {Object} AvatarConfig
 * @property {string} file      VRMファイル名
 * @property {string} name      表示名
 * @property {string} gender    性別
 * @property {string} voice     Live API prebuilt voice名
 */
export const AVATARS = {
  asaka_lily: {
    file: "asaka_lily.vrm",
    name: "浅香リリ",
    gender: "female",
    voice: "Leda",
  },
  miura_luca: {
    file: "miura_luca.vrm",
    name: "三浦ルカ",
    gender: "male",
    voice: "Orus",
  },
  matsuda_emma: {
    file: "matsuda_emma.vrm",
    name: "松田エマ",
    gender: "female",
    voice: "Aoede",
  },
  joy: {
    file: "JOY.vrm",
    name: "JOY",
    gender: "female",
    voice: "Leda",
  },
};

/** @type {string} デフォルトアバターのキー */
export const DEFAULT_AVATAR_KEY = "asaka_lily";

/**
 * 対応言語（日本語・英語のみ）
 * ※中国語・台湾華語・韓国語・マレー語・フィリピン語はスコープ外
 *
 * @typedef {Object} LanguageConfig
 * @property {string} label  UI表示名
 */
export const LANGUAGES = {
  "ja-JP": { label: "日本語" },
  "en-US": { label: "English" },
};

/** @type {string} デフォルト言語 */
export const DEFAULT_LANGUAGE = "ja-JP";

/** @type {string} ローカルストレージのAPIキー保存キー */
export const STORAGE_KEY_API_KEY = "warplive:apiKey";

/** @type {string} ローカルストレージの言語保存キー */
export const STORAGE_KEY_LANGUAGE = "warplive:language";

/** @type {string} ローカルストレージのアバター保存キー */
export const STORAGE_KEY_AVATAR = "warplive:avatar";

/** @type {string} ローカルストレージのウェイクワード保存キー */
export const STORAGE_KEY_WAKE_WORD = "warplive:wakeWord";

/** @type {string} ローカルストレージの表示モード保存キー */
export const STORAGE_KEY_MODE = "warplive:mode";

/** @type {string} 日時表示モードの識別子 */
export const MODE_DATETIME = "datetime";

/* =========================================================================
 * Phase 2: 3Dアバター表示関連
 * ========================================================================= */

/** @type {string} Three.js CDN URL */
export const THREE_URL = "https://esm.sh/three@0.169.0";

/** @type {string} @pixiv/three-vrm CDN URL */
export const VRM_URL = "https://esm.sh/@pixiv/three-vrm@3.4.0";

/** @type {string} @pixiv/three-vrm-animation CDN URL */
export const VRM_ANIMATION_URL = "https://esm.sh/@pixiv/three-vrm-animation@3.4.0";

/** @type {string} GLTFLoader CDN URL（three-vrmの依存） */
export const GLTF_LOADER_URL = "https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

/** @type {string} アセットディレクトリのベースパス */
export const ASSETS_BASE = "./assets";

/** @type {string} VRMAディレクトリのベースパス */
export const VRMA_BASE = `${ASSETS_BASE}/vrma`;

/**
 * VRMAアニメーションファイルパス（24種）
 * @typedef {Object} VrmaPaths
 */
export const VRMA_PATHS = {
  VRMA_01: `${VRMA_BASE}/VRMA_01.vrma`,
  VRMA_02: `${VRMA_BASE}/VRMA_02.vrma`,
  VRMA_03: `${VRMA_BASE}/VRMA_03.vrma`,
  VRMA_04: `${VRMA_BASE}/VRMA_04.vrma`,
  VRMA_05: `${VRMA_BASE}/VRMA_05.vrma`,
  VRMA_06: `${VRMA_BASE}/VRMA_06.vrma`,
  VRMA_07: `${VRMA_BASE}/VRMA_07.vrma`,
  "001_motion_pose": `${VRMA_BASE}/001_motion_pose.vrma`,
  "002_dogeza": `${VRMA_BASE}/002_dogeza.vrma`,
  "003_humidai": `${VRMA_BASE}/003_humidai.vrma`,
  "004_hello_1": `${VRMA_BASE}/004_hello_1.vrma`,
  "005_smartphone": `${VRMA_BASE}/005_smartphone.vrma`,
  "006_drinkwater": `${VRMA_BASE}/006_drinkwater.vrma`,
  "007_gekirei": `${VRMA_BASE}/007_gekirei.vrma`,
  "008_gatan": `${VRMA_BASE}/008_gatan.vrma`,
  Angry: `${VRMA_BASE}/Angry.vrma`,
  Blush: `${VRMA_BASE}/Blush.vrma`,
  Clapping: `${VRMA_BASE}/Clapping.vrma`,
  Goodbye: `${VRMA_BASE}/Goodbye.vrma`,
  Jump: `${VRMA_BASE}/Jump.vrma`,
  LookAround: `${VRMA_BASE}/LookAround.vrma`,
  Relax: `${VRMA_BASE}/Relax.vrma`,
  Sad: `${VRMA_BASE}/Sad.vrma`,
  Sleepy: `${VRMA_BASE}/Sleepy.vrma`,
  Surprised: `${VRMA_BASE}/Surprised.vrma`,
  Thinking: `${VRMA_BASE}/Thinking.vrma`,
};

/**
 * 感情タグ → VRMAキー マッピング
 * spec.md 2.3.3節参照
 */
export const EMOTION_TO_VRMA = {
  neutral: "VRMA_01",
  happy: "VRMA_03",
  angry: "Angry",
  sad: "Sad",
  relaxed: "Relax",
  surprised: "Surprised",
};

/**
 * 感情タグ → VRM表情（blendShape）マッピング
 * spec.md 2.3.3節参照
 */
export const EMOTION_TO_EXPRESSION = {
  neutral: "NEUTRAL",
  happy: "JOY",
  angry: "ANGRY",
  sad: "SORROW",
  relaxed: "FUN",
  surprised: "SURPRISED",
};

/**
 * 待機モーションプール（5種）
 * spec.md 2.3.5節参照
 * @type {string[]}
 */
export const IDLE_MOTION_POOL = [
  "VRMA_06",
  "Blush",
  "Sleepy",
  "Thinking",
];

/** @type {number} VRMAクロスフェード時間（秒） */
export const VRMA_CROSSFADE_SEC = 0.3;

/**
 * 対話中の静止ベースポーズとして使用するVRMAキー
 * spec.md 2.3.5「対話中のアニメーション制御」準拠
 * Tポーズ回避のため、自然な立位ポーズ（VRMA_01: Show full body）をフリーズ再生する
 * @type {string}
 */
export const CONVERSATION_BASE_POSE = "VRMA_01";

/* =========================================================================
 * Phase 5: リップシンク関連（spec.md 2.2.3節準拠）
 * ========================================================================= */

/** @type {number} AnalyserNodeのfftSize（振幅取得のみなら小さくて十分） */
export const LIP_SYNC_FFT_SIZE = 1024;

/** @type {number} lerpスムージング係数（0.3〜0.5） */
export const LIP_SYNC_SMOOTHING = 0.4;

/** @type {number} 振幅増幅係数（AI音声は振幅が小さい傾向があるため） */
export const LIP_SYNC_AMPLITUDE_GAIN = 1.5;

/**
 * 対話中のアバター状態（spec.md 2.3.5「対話中のアニメーション制御」準拠）
 * - listening: ユーザー発話中（静止・聞き手）
 * - speaking:  AI応答中（静止 + リップシンクのみ）
 * - idle:      対話アイドル（静止）
 * @typedef {'listening'|'speaking'|'idle'} ConversationState
 */

/** @type {number} カメラの初期距離（全身が映る構図） */
export const CAMERA_DISTANCE = 3.0;

/** @type {number} カメラの高さ（メートル単位） */
export const CAMERA_HEIGHT = 1.2;

/** @type {number} カメラの注視点の高さ（メートル単位） */
export const CAMERA_TARGET_HEIGHT = 1.0;

/* =========================================================================
 * Phase 3: Gemini Live API 関連
 * ========================================================================= */

/**
 * system instructionテンプレート
 * `{name}` は選択中のアバター名に置換される
 * @type {string}
 */
export const SYSTEM_INSTRUCTION_TEMPLATE = `あなたは「{name}」という名前の3Dアバターアシスタントです。
以下のルールを守ってください：

1. 明るく親しみやすい性格で、ユーザーをフレンドリーにサポートする。
2. 一回の発言は短く（2〜3文以内）にまとめる。
3. 必要に応じてユーザーに質問を投げ返し、対話を促す。
//4. 応答テキストの先頭に必ず感情タグ [neutral], [happy], [angry], [sad], [relaxed], [surprised] のいずれかを付ける。タグは発声せずテキスト先頭にのみ付ける。
5. ユーザーが「今なんじ」というキーフレーズを言った場合、対応する関数を呼び出す。

以下は応答の例です:

ユーザー: こんにちは
{name}: こんにちは！今日もよい日だね。何かお手伝いすることある？
//{name}: [happy]こんにちは！今日もよい日だね。何かお手伝いすることある？

ユーザー: 今なんじ？
{name}: 確認するね！
//{name}: [neutral]確認するね！

ユーザー: 今日どんな気分？
{name}: 絶好調だよ！あなたと話せて嬉しいな。最近どう過ごしてる？
//{name}: [happy]絶好調だよ！あなたと話せて嬉しいな。最近どう過ごしてる？

ユーザー: あー、疲れた…
{name}: お疲れ様…。無理しないでね。`;
//{name}: [sad]お疲れ様…。無理しないでね。`;

/**
 * functionDeclarations（スコープ内: get_current_time のみ）
 * @type {Object[]}
 */
export const FUNCTION_DECLARATIONS = [
  {
    name: "get_current_time",
    description: "ユーザーが現在の時刻を尋ねた場合に呼び出します。例: 「今なんじ」「なんじですか」",
    parameters: { type: "object", properties: {} },
  },
];