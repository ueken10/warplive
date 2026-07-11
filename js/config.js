/**
 * WarpLive - config.js
 * 定数・設定値の一元管理
 *
 * Phase 1: 空枠（後続フェーズで随時追加）
 */

/** @type {string} Gemini Live API WebSocket URL */
export const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** @type {string} Gemini Live API モデル名 */
export const GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-latest";

/** @type {number} アイドルタイムアウト（秒）。この秒数ユーザー発話がない場合セッション切断 */
export const IDLE_TIMEOUT_SEC = 30;

/** @type {number} WebSocket接続失敗時のリトライ待機時間（ミリ秒） */
export const RECONNECT_DELAY_MS = 5000;

/**
 * アバター別設定
 *
 * @typedef {Object} AvatarConfig
 * @property {string} file      VRMファイル名
 * @property {string} name      表示名
 * @property {string} gender    性別
 * @property {string} voice     Live API prebuilt voice名
 * @property {string[]} wakeWords  ウェイクワード配列（日本語・英語）
 */
export const AVATARS = {
  asaka_lily: {
    file: "asaka_lily.vrm",
    name: "浅香リリ",
    gender: "female",
    voice: "Leda",
    wakeWords: ["ねえ、リリ", "ねえリリ", "Hey Lily"],
  },
  miura_luca: {
    file: "miura_luca.vrm",
    name: "三浦ルカ",
    gender: "male",
    voice: "Orus",
    wakeWords: ["ねえ、ルカ", "ねえルカ", "Hey Luca"],
  },
  matsuda_emma: {
    file: "matsuda_emma.vrm",
    name: "松田エマ",
    gender: "female",
    voice: "Aoede",
    wakeWords: ["ねえ、エマ", "ねえエマ", "Hey Emma"],
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
 * VRMAアニメーションファイルパス（15種）
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
};

/**
 * 感情タグ → VRMAキー マッピング
 * spec.md 2.3.3節参照
 */
export const EMOTION_TO_VRMA = {
  neutral: "VRMA_06",
  joy: "VRMA_03",
  angry: "007_gekirei",
  sorrow: "005_smartphone",
  fun: "VRMA_03",
  surprised: "008_gatan",
  greeted: "VRMA_02",
};

/**
 * 待機モーションプール（5種）
 * spec.md 2.3.5節参照
 * @type {string[]}
 */
export const IDLE_MOTION_POOL = [
  "VRMA_01",
  "VRMA_05",
  "VRMA_07",
  "001_motion_pose",
  "003_humidai",
];

/** @type {number} VRMAクロスフェード時間（秒） */
export const VRMA_CROSSFADE_SEC = 0.3;

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
4. 応答テキストの先頭に必ず感情タグ [neutral], [joy], [angry], [sorrow], [fun], [surprised], [greeted] のいずれかを付ける。タグは発声せずテキスト先頭にのみ付ける。
5. ユーザーが「今何時」「何時」などのキーフレーズを言った場合、対応する関数を呼び出す。

以下は応答の例です:

ユーザー: こんにちは
{name}: [greeted]こんにちは！今日もよい日だね。何かお手伝いすることある？

ユーザー: 今何時？
{name}: [neutral]確認するね！

ユーザー: 今日どんな気分？
{name}: [joy]絶好調だよ！あなたと話せて嬉しいな。最近どう過ごしてる？

ユーザー: あー、疲れた…
{name}: [sorrow]お疲れ様…。無理しないでね。`;

/**
 * functionDeclarations（スコープ内: get_current_time のみ）
 * @type {Object[]}
 */
export const FUNCTION_DECLARATIONS = [
  {
    name: "get_current_time",
    description: "ユーザーが現在の時刻を尋ねた場合に呼び出します。例: 「今何時」「何時ですか」",
    parameters: { type: "object", properties: {} },
  },
];