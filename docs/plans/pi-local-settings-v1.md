# pi-local-settings v1 實作與發布計畫

## 1. 文件用途與目前狀態

本文件供另一個模型接手實作。這是計畫，不是完成報告；撰寫本文件時尚未實作 Extension、安裝依賴或發布任何套件。

使用者指示是先完成計畫，再由另一個模型實作。npm 套件名稱、License、信任 UX 與首次發布備案均已確認；此確認不是開始實作的訊號。接手者應閱讀本計畫，取得開始實作的訊號後才執行。

### 已確認的環境

- 本地 repo：`~/Private-Repos/pi-extensions`。
- 目標 GitHub repo：<https://github.com/chenwei791129/pi-extensions>。
- GitHub repo 目前是空的公開 repo；目前登入帳號 `chenwei791129` 具有 ADMIN 權限。
- 本地原為空目錄，目前僅初始化 Git，分支為 `main`，並設定 `origin` 為 `git@github.com:chenwei791129/pi-extensions.git`。
- 尚無 commit、push、tag、GitHub Actions 執行或 npm 發布。
- 本機 Pi 版本為 `1.1.0`，套件名稱為 `@earendil-works/pi-coding-agent`。
- 本機 Node.js 為 `24.14.1`、npm 為 `11.18.0`。接手時應重新確認版本與登入狀態。
- 前次執行 `npm whoami` 回報尚未登入；登入狀態須於發布前重新確認。
- 使用者已確認註冊 npm 帳號 `chenwei791129`，scope 為 `@chenwei791129`，正式套件名稱為 `@chenwei791129/pi-local-settings`。
- 使用者已確認採用 MIT License。

## 2. 目標與已確認範圍

建立可逐步擴充的 Pi Extensions monorepo，第一個套件正式名稱為 `@chenwei791129/pi-local-settings`。

Extension 自動探索：

```text
<啟動工作目錄>/.pi/settings.local.json
```

第一版僅支援下列根層級欄位：

```json
{
  "skills": ["../.claude/skills"],
  "prompts": ["../my-prompts"],
  "themes": ["../my-themes"]
}
```

### 核心契約

- 三個欄位均為字串陣列，可指定一般檔案或目錄。
- 相對路徑以設定檔所在的 `.pi/` 為基準，不是 process 的任意當前路徑。
- 支援絕對路徑與 `~/`；不承諾 `~other-user` 或環境變數展開。
- 使用 Pi 的 `resources_discover` 追加資源路徑。
- 啟動與 `/reload` 都重新讀取設定。
- 不改寫全域或專案的 `settings.json`，也不改寫使用者的 `settings.local.json`。
- 不向父目錄或 Git root 搜尋設定；專案在此指 Pi 的啟動工作目錄。
- `themes` 僅載入主題資源，不等於 `theme` 的主題選擇。
- 套件發布至使用者自己的 npm scope，發布工作由 GitHub Actions 執行。
- npm metadata 須符合 Pi package gallery 的探索條件，發布後再驗證實際呈現。

### 明確不做

- 其他 Pi settings，例如模型、thinking、工具啟用、`theme`、`extensions`、`packages`。
- 任意設定合併、修改 Pi 內部 SettingsManager 或 monkey-patch。
- glob、`!pattern`、`+path`、`-path` 等篩選語法。
- 移除已由 Pi 或其他 Extension 載入的資源。
- 同名資源的「本地優先覆寫」保證。
- 自動安裝 npm/git 套件，或執行設定檔中的命令。
- 檔案 watcher、背景程序、自訂 TUI 元件。
- 第一版就引入複雜的多套件自動版本化平台。

## 3. 已確認決策與發布前置依賴

### 已確認決策

1. **npm 套件**：`@chenwei791129/pi-local-settings`，由已註冊的 `chenwei791129` npm 帳號持有。
2. **License**：MIT。
3. **信任 UX**：每個 session 首次載入時詢問；設定未變更的 `/reload` 不重複詢問，變更後重新確認。自動化可用 `--trust-local-settings` 明確授權，且不得突破 Pi 對專案信任的拒絕。詳細策略見第 6 節。
4. **發布策略**：優先 GitHub Actions＋OIDC。若首次建立套件無法直接使用 OIDC，使用者同意以 GitHub Secret 提供短效、最小權限 npm token，仍由 GitHub Actions 完成首次發布；成功後設定 OIDC、撤銷 token 並刪除 Secret。

### 發布前仍須完成的操作

- 確認 npm 當時是否允許為尚未發布的套件設定 Trusted Publisher，據此選擇已核准的 OIDC 或 token bootstrap 路徑。
- 確認帳號發布權限，完成需要的登入、2FA、Secret 或 Trusted Publisher 綁定。
- 以上是發布階段的外部前置依賴，不是尚未決定的產品需求；不必因此延後本地實作與驗證。
- 不需要使用者提供密碼、OTP 或 token 到對話中。登入、2FA、Secret 與 npm 網頁上的 publisher 設定應請使用者在自己的環境操作。

## 4. 建議 repo 架構

參考 <https://github.com/narumiruna/pi-extensions> 的 npm workspaces、獨立套件目錄與套件 metadata，但不要複製其大量工具、所有相依套件或整套版本發布系統。

建議初始結構：

```text
pi-extensions/
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml
├── docs/
│   ├── plans/pi-local-settings-v1.md
│   └── releasing.md
├── packages/
│   └── pi-local-settings/
│       ├── src/
│       │   ├── index.ts
│       │   └── config.ts
│       ├── test/
│       │   ├── config.test.ts
│       │   ├── extension.test.ts
│       │   └── integration.test.ts
│       ├── package.json
│       ├── README.md
│       └── LICENSE
├── scripts/                 # 僅在發布驗證等邏輯確有需要時加入
├── .gitignore
├── .node-version
├── biome.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
└── LICENSE
```

- 根 package 設為 `private: true`，使用 `workspaces: ["packages/*"]`。
- 每個 Extension 各自發布為一個 npm package；根 package 不發布。
- 根 `pi.extensions` 可明列第一個 Extension 的入口，支援直接從 repo 使用；不要同時由兩個入口重複載入相同 Extension。
- TypeScript 原始碼可直接透過 Pi 載入，第一版不必為了發布引入 bundler。
- 優先使用 npm 與 lockfile；Node 24 LTS 作為開發／CI 基準，宣告的最低版本須有驗證依據。
- 使用 TypeScript 型別檢查、Biome 與一套簡單測試工具。可採 Node 內建 test runner；若採 TypeScript 直接執行，需確認目標 Node 的支援。
- 測試 Pi 版本先固定為 `1.1.0`；不要未測試就聲稱支援所有舊版 Pi。
- Pi host 套件放入 `peerDependencies`，依官方建議使用 `"*"`；開發／測試另固定 `1.1.0`，README 明示已測版本。不要把 host 放進會隨套件安裝的 `dependencies`。
- 新 README、程式註解、commit message 使用英文；發布操作文件使用臺灣正體中文。

## 5. 資源解析設計

### `config.ts`

負責檔案讀取、JSON 驗證與路徑解析，不依賴互動 UI。

建議回傳資料包含：設定檔位置、狀態、三類已解析路徑、診斷訊息，以及信任判斷需要的設定識別資訊。保持資料結構簡單，不建立通用設定框架。

處理規則：

1. 設定檔不存在：安靜地不載入任何額外資源。
2. JSON 語法錯誤、根值不是物件、讀取失敗：回報檔案位置與原因，整份不套用，不讓 Pi 啟動失敗。
3. 未支援欄位：警告並忽略該欄位；不要印出其值，以免暴露使用者誤放的秘密。
4. 已支援欄位不是陣列：警告並略過該欄位。
5. 陣列元素不是字串、空白字串或使用未支援的語法：逐項警告並略過；保留其他有效項目。
6. 拒絕未支援語法時，訊息須解釋是 v1 限制；檔名真的含特殊字元的邊界也應明確記錄。
7. 將相對路徑轉為絕對路徑；支援 `~/`，不展開 `$VAR`。
8. 驗證目標存在，且為一般檔案或目錄；檔案格式限制對齊 Pi 原生 loader。
9. symlink 可指向外部資源，但應透過 canonical path 去重並讓診斷顯示實際解析結果；不要宣稱目錄隔離。
10. 去重保留順序。SKILL.md、prompt、theme 的內容驗證交給 Pi，不重寫第三方 loader。
11. 對設定檔採合理大小限制；避免特殊檔案／無界讀取讓啟動卡住。不要為此引入過度設計的檔案系統抽象。

### `index.ts`

只負責 Pi API 連接：

- 註冊 `resources_discover`，回傳 `skillPaths`、`promptPaths`、`themePaths`。
- 在 handler 中讀取設定、檢查信任、回報診斷，再回傳有效路徑。
- 加入唯讀 `/local-settings` 診斷命令，顯示最後一次探索的來源、授權狀態、解析結果及警告；不藉由診斷命令改變信任或套用設定。
- 使用 UI 通知時區分模式；print／JSON 模式的錯誤不要污染 stdout 協定輸出。必要時寫 stderr，並避免輸出敏感值。
- 不修改 system prompt、不註冊 model-callable tool。

## 6. 信任與重載設計

### 已確認的 Pi 1.1.0 限制

- `settings.local.json` 不在原生需要 project trust 的資源清單。
- 沒有其他受保護資源時，Pi 可能直接把專案視為 trusted，且不發出 `project_trust` 事件。
- 全域 Extension 的 `resources_discover` 可以追加資源，因此必須自行處理本地檔授權。
- Git 忽略狀態不是信任證明；skills 與 prompts 也可能引導執行程式。

### 已確認的 v1 信任策略與實作建議

1. `ctx.isProjectTrusted()` 為 false 時，不載入本地資源；Extension 的 opt-in 也不得突破這個拒絕。
2. 不因為 context 為 true 就自動認定本地檔已授權。
3. TUI 下第一次遇到有效本地資源時，顯示專用確認，列出設定來源與即將載入的路徑。
4. 僅記住本 session 對該設定的同意／拒絕。可使用 `pi.appendEntry()` 儲存不進模型 context 的自訂紀錄，讓 `/reload` 不會對未變動的設定重複詢問。
5. 授權紀錄綁定 canonical cwd、設定檔識別與設定內容／解析路徑摘要；設定變動時重新確認。不要只用一個永遠有效的布林值。
6. 此授權不是對目錄內每個檔案內容的完整性驗證，也不是 sandbox；文件要清楚揭露。
7. 提供明確的 CLI opt-in `--trust-local-settings`，供自動化使用；實作時若發現名稱衝突，先回報再調整。
8. 非互動模式若沒有明確 opt-in 或有效的既有 session 授權，預設略過，不等待 UI。
9. 不寫入全域 settings、專案 settings 或自訂永久 trust 檔，也不要擅自改 Pi 的 `trust.json`。

### 重載契約

- 每次 `resources_discover` 重新解析設定，不累積上次結果。
- 刪除路徑或刪除設定檔後，下一次 `/reload` 應移除由本 Extension 貢獻的資源；由其他來源提供的同一資源仍可存在。
- 用真實 Pi loader 的 integration test 驗證此行為，不只 mock event handler。
- 對原生 `--no-skills`、`--no-prompt-templates`、`--no-themes` 等旗標，先查證目前 CLI 實際名稱與動態資源語意，再決定如何文件化；不可宣稱已自然繼承所有 CLI 優先序，也不要私自解析 `process.argv` 模擬整套 CLI。
- 同名資源交由 Pi 自己判定與回報 collision；本 Extension 不保證較晚加入的資源勝出。

## 7. 測試與驗收

### 單元／Extension 契約測試

- 缺少設定檔、空物件、空陣列。
- 三個合法欄位及混合檔案／目錄。
- `.pi/` 相對路徑、絕對路徑、`~/`。
- malformed JSON、非物件根值、錯誤欄位型別、錯誤陣列元素。
- 未支援欄位及未支援的 glob／篩選語法有明確診斷。
- 不存在的路徑、錯誤檔案類型、重複與 symlink 路徑。
- 不向父目錄搜尋，不使用錯誤 cwd 解析。
- Pi 拒絕信任時，即使提供 Extension opt-in 也不載入。
- 僅有本地檔、context 為 trusted，仍不能跳過本地專用授權。
- TUI 同意／拒絕、未變更重載、變更後重新確認、非互動預設略過、明確 opt-in。
- 診斷命令唯讀，且不顯示未知欄位的敏感值。

### 真實 Pi 整合測試

使用暫存 cwd 與隔離 agentDir，不讀取開發者真實 Pi 設定、不呼叫付費模型。

- 真實 loader 能載入 Extension，取得三類資源。
- 共用 `.pi/settings.json` 資源與本地資源並存。
- `/reload` 增加、移除資源與移除設定檔的結果正確。
- 同名衝突不會變成本地任意覆寫。
- 全域 settings、專案 settings、本地設定檔在操作前後內容完全不變。
- npm tarball 包含入口與所有被引用的檔案，從封裝產物可被 Pi 載入。

### 完成條件

- 所有配置、信任及重載契約均有驗證。
- typecheck、format／lint、tests、pack 檢查通過。
- 文件明示支援欄位、限制、路徑基準、信任 UX、安裝與診斷方式。
- 不只是「有 `pi-package` keyword」就宣稱已在 gallery 上架；實際發布與探索分開驗收。

## 8. CI 與發布

### 套件 metadata

正式 package 至少包含：

- `name: "@chenwei791129/pi-local-settings"`、版本、英文 description、`license: "MIT"`。
- `keywords` 包含 `pi-package`，另可加 `pi-extension`、`settings`、`skills`。
- `pi.extensions` 指向發布產物中確實存在的 TypeScript 入口。
- `files` 白名單，僅發布必要程式、README、LICENSE 等。
- `repository.url` 對應 `chenwei791129/pi-extensions`，`repository.directory` 為 `packages/pi-local-settings`。
- `homepage`、`bugs`、`publishConfig.access: "public"`。
- 適當的 engines 與 peerDependencies。

### `ci.yml`

- 對 pull request 與 main push 執行。
- 僅需 `contents: read`，不提供 npm 發布憑證。
- 固定 Node 版本與 dependency lockfile。
- 執行安裝、型別／格式檢查、測試與 tarball 檢查。
- 審查相依套件 lifecycle scripts，明確決定是否需要；不要因為安裝失敗就任意放寬腳本執行。
- Action 固定至查證過的 commit SHA，並以註解記錄版本。

### `publish.yml`

第一版建議使用明確版本 tag 觸發，格式例如 `pi-local-settings-v0.1.0`；未來每個套件可各自發布。不要每次 main push 都自動發布新版本。

- 只接受符合格式且版本與 package.json 一致的 tag。
- 驗證 tag 指向已納入 main 的 commit，並在發布 workflow 重新執行必要檢查。
- 使用 GitHub-hosted runner，與 npm Trusted Publishing 相容。
- OIDC 發布 job 使用 `id-token: write`，其他 job 不授予此權限。
- Trusted Publisher 指向 owner `chenwei791129`、repo `pi-extensions`、workflow filename `publish.yml`。
- 若採 GitHub Environment，名稱必須和 npm 設定完全一致。
- 確保 Node/npm 版本符合 Trusted Publishing 當時的最低要求。
- 依 npm 現行規則選擇並授權 `npm publish` 或 staged publishing；不要假設所有新 publisher 預設允許直接發布。
- 產生 provenance，使用 public access，發布前確認 tarball 內容。
- 不在 workflow 中使用未驗證的外部輸入直接拼接 shell 命令。
- 透過 concurrency 避免同一套件並行發布。
- 不建立無人看管的長期 token 作為預設方案。

### 首次發布前置依賴

npm 的 Trusted Publisher 需在套件設定中綁定。接手時查證是否支援未發布套件的預先綁定；不能假設首次 OIDC 發布一定可直接成功。

若需要 bootstrap，使用者已同意以下 token 備案：

- 使用者透過 GitHub Secret 自行提供最小權限、短效的 granular token；實際首次發布仍由 GitHub Actions 執行。
- 成功後設定 OIDC，撤銷首次發布 token 並刪除對應 Secret；正式發布流程不保留長期 token。
- 若上述兩條路徑都不可行，只能由使用者先手動建立或發布套件，這仍是未核准的例外，必須先取得同意，不能自行改變交付要求。
- OIDC 綁定後再驗證一次實際 Actions 發布；使用經確認的下一個合法版本，不重複發布既有版本。設定已儲存或 workflow 已建立不等於發布成功。

## 9. Pi package gallery 驗證

官方文件指出 npm 的 `pi-package` keyword 使套件具備 gallery 探索資格。

發布後：

1. 使用 npm registry 查詢確認正式套件、版本、public access、metadata 與 tarball 正常。
2. 在隔離 Pi 環境中安裝 `npm:@chenwei791129/pi-local-settings` 並 smoke test。
3. 查看 <https://pi.dev/packages> 的搜尋或對應套件頁是否已呈現，保留可驗證 URL。
4. 若 npm 已發布但 gallery 尚未更新，記錄為外部索引待完成，不宣稱已上架，也不為了刷新索引重複發布版本。

## 10. 實作順序與品質關卡

1. 依已確認的套件名稱、MIT License、信任 UX 與發布策略開始；重新確認環境狀態，並在發布前完成必要的帳號與 publisher 設定。
2. 建立最小 npm workspace、開發工具與 repo／package metadata。
3. 實作設定解析與單元測試。
4. 接上 `resources_discover`、信任流程與唯讀診斷命令。
5. 加入真實 Pi loader／reload 與 tarball 整合測試。
6. 完成 README、發布操作文件與 CI／發布 workflow。
7. 完整驗證，再呼叫 `simplify` 並套用必要簡化，重新驗證。
8. 執行 fresh-context、read-only reviewer 的 review-loop；最多三輪，有阻擋問題不得發布。
9. 修正後再次驗證，實質程式變更需補做適用的 simplify 與 review。
10. 最終 diff 審閱後，取得／確認提交上傳授權；按檔名 stage，只提交本次工作。
11. push、確認 CI、完成 npm publisher 前置設定，建立版本 tag 並由 Actions 發布。
12. 驗證 npm 安裝、provenance 與 gallery 呈現，回報實際證據和未完成的外部依賴。

品質關卡指引位置（目前環境）：

```text
~/.pi/agent/extensions/subagent/prompts/review-loop.md
```

`simplify` 依 git diff 判定範圍；新檔須用 `git add -N <檔案>` 登記，或明確傳入 files。空 repo 尚無 HEAD，須先確認工具如何處理初始提交情境，不能略過關卡或假稱通過。必要時建立經授權的初始基準提交後，再檢查實作 diff。

reviewer 應直接讀取需求、diff 與檔案，不提供前一位 reviewer 的結論。實作、發布流程與信任機制均屬需要審查的範圍。

## 11. 已查閱的參考資料

- 架構參考：<https://github.com/narumiruna/pi-extensions>。
- Pi Extensions：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>。
- Pi Packages：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md>。
- npm Trusted Publishing：<https://docs.npmjs.com/trusted-publishers>。
- Pi package gallery：<https://pi.dev/packages>。

評估已實際檢查本機 Pi 1.1.0 的 Extension 型別、resource loader 與 project trust 實作；線上 main 可能持續變更，接手者應以鎖定的測試版本為準。

本機官方文件目前位於：

```text
~/.pi/agent/install/releases/1.1.0/node_modules/@earendil-works/pi-coding-agent/docs/
```

重要 API 邊界：`resources_discover` 只回傳 `skillPaths`、`promptPaths`、`themePaths`；`getSettings()` 是副本，本專案不需要也不應依賴內部設定覆寫。
