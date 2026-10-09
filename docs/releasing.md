# 發布操作

版本與 tag 由 **release-please manifest 模式**管理，不需要每次手動打 tag。
根套件是 private，不列入 release manifest、不發布。

## 每個 package 獨立版本與 tag

`release-please-config.json` 的 `packages` 是發布 allowlist。目前：

| Package 路徑 | npm 套件 | Component／tag |
| --- | --- | --- |
| `packages/pi-local-settings` | `@chenwei791129/pi-local-settings` | `pi-local-settings-vX.Y.Z` |

每個 package 有自己的 `package.json` 版本、`CHANGELOG.md`、GitHub Release
與 npm 版本。沒有根目錄 `vX.Y.Z` tag，也沒有 linked-versions。

目前使用一個彙整 Release PR；這**不代表所有 package 共用版本**。只改動 A
不會發布無變更且不依賴 A 的 B。`node-workspace` plugin 更新共用
`package-lock.json`，也會依實際 workspace 相依關係更新必要的依賴範圍及版本；
各 package 仍各自產生 tag。測試以固定 release-please **17.3.0** 驗證此契約，
對應 action **v4.4.1** 的 lockfile。升級 action 時必須同步確認測試版本。

`.release-please-manifest.json` 記錄 release-please 管理的已發布版本。
尚未首次 release 時保持 `{}`，目前 package 的 `initial-version` 為 `0.1.0`。
不要提前把 0.1.0 寫成已發布版本，也不要長期設定固定 `release-as`。
此檔案保留 release-please 產生的格式：Biome 僅停用它的 formatter，仍檢查
JSON 語法，其他檔案的格式檢查不變；不要在每次 Release PR 手動改格式。

## 正常發布流程

1. 以 Conventional Commits 合併變更到 main，例如 `feat:`、`fix:`。
   建議 squash merge 時保留此格式。純根目錄 CI／發布文件變更通常不會替每個
   package 產生新版本；需要發布的修正應包含對應 package 的實際變更。
2. `.github/workflows/release-please.yml` 建立／更新 Release PR，產生版本及
   CHANGELOG 更新。Release PR 仍須由維護者審閱與合併，不自動批准或合併。
3. 合併 Release PR 後，release-please 自動為其中每個已發布 package 建立獨立
   tag 與 GitHub Release。
4. 每個 tag 都明確 dispatch `.github/workflows/publish.yml`，由該 tag 的快照
   執行驗證，再只發布選中的 workspace；不使用 `npm publish --workspaces`。
5. 發布成功後完成下方 npm／provenance／gallery 的獨立驗收。

### GitHub 設定與 bot 事件

請在 repository **Settings → Actions → General → Workflow permissions** 啟用
**Allow GitHub Actions to create and approve pull requests**。此開關是 bot 建立
Release PR 的必要設定；workflow 本身不會批准 PR。不要因此把整個 repo 的
預設 workflow 權限改成 write，權限已由各 job 明確指定。

預設 `GITHUB_TOKEN` 建立的 PR／tag 不會自動觸發其他 workflow，因此本實作：

- release-please 使用內建的短效 `GITHUB_TOKEN`，不要求額外 GitHub PAT。
- `scripts/dispatch-releases.ts` 對每個已建立／更新的 Release PR 明確 dispatch
  `ci.yml` 到同 repo 的 Release PR branch，使其 head commit 取得 CI checks。
- 對每個 release 的 `<path>--tag_name` 明確 dispatch `publish.yml` 到該 tag。
  `workflow_dispatch` 是 `GITHUB_TOKEN` 可以啟動的例外，不依賴 bot 的 tag push。
- dispatcher 先驗證 package allowlist、component／版本格式、PR branch／base／
  repo；資料以 API JSON body 傳遞，不拼接 shell。
- release-please job 只有建立 release／PR／標籤與 dispatch 所需權限，沒有
  npm token 或 OIDC。CI 是 `contents: read`；只有發布 job 有 `id-token: write`。

建議以 GitHub ruleset 保護 main 與 release tags，並要求 CI 的 `check` 通過。
repo 設定、workflow 檔案存在或本機測試通過，不代表遠端 Actions 已成功。

## 新增 package

1. 建立 `packages/<package>`，具備自己的 public scoped npm metadata、版本、
   README、License、Pi manifest，以及對應測試與 tarball 檢查。
2. 在 `release-please-config.json` 的 `packages` 新增：

   ```json
   "packages/pi-example": {
     "component": "pi-example",
     "initial-version": "0.1.0"
   }
   ```

   此片段放入既有 `packages` 物件，不是完整設定檔。`component` 必須唯一，
   使用小寫英數與連字號；tag 為 `pi-example-vX.Y.Z`。不要加入 `.`，不要關閉
   `include-component-in-tag`，不要使用 wildcard、父目錄或不同 tag separator。
3. 新 package 尚未 release 時，不預先填入版本 manifest。已有正式 release 的
   package 遷入時，依 release-please bootstrap 文件填入真實已發布版本。
4. 配置該 npm package 的 Trusted Publisher。publisher 仍是本 repo 的
   **`publish.yml`**（沒有 environment）；不是 `release-please.yml`。
5. 現有 dispatcher、publish selector 與 per-package concurrency 自動支援新增
   allowlist entry，不需為每個 package 新建 workflow。
6. **目前 bootstrap token 只授權首次 pi-local-settings 發布**，新增 package
   不會自動繼承它。若 npm 尚無法替新的未發布 package 預設 OIDC publisher，
   需另確認該 package 的最小權限 bootstrap 方案；不能擴用現有 token。

## 發布前品質關卡

取得 commit／push 授權後才提交；release tag 則由合併 Release PR 自動產生。
依序完成實作、simplify、fresh-context review-loop，沒有阻擋問題後：

```sh
npm ci --ignore-scripts
npm run check
npm run check:pack
```

使用 `.node-version` 的 Node 24.14.1。Actions 固定至查證過的 commit SHA，
未啟用 dependency cache。依賴 lifecycle scripts 保持停用，決策見根 README。
審閱 `git status`，按檔名 stage，只提交本次工作；不要使用 `git add .`。

`publish.yml` 同時接受 tag push 與對**既有 tag**的 workflow dispatch。
`scripts/release.ts` 會拒絕 branch dispatch、未知／根 tag、版本不符、event SHA
不符及尚未納入 main 的 commit。它從 tag 中選擇唯一的已配置 package，輸出經
驗證的 workspace 路徑。validate job 重跑 checks／pack，發布 job 再確認來源，
以 public access／provenance 發布。不同版本的同一 package 不會同時發布；
不同 package 使用各自的 concurrency group。

## 首次 npm 發布與 bootstrap

再次查證 [npm Trusted Publishing 文件](https://docs.npmjs.com/trusted-publishers)。
目前需 Node >=22.14.0、npm >=11.5.1；發布守門腳本會檢查 npm 下限。
本機 `npm whoami` 不是 OIDC 權限測試，本機登入不是 Actions 發布的必要條件。

目前官方文件的設定入口是既有套件的 Settings → Trusted Publisher，沒有描述
未發布套件的預先綁定入口。若當時 npm 已能預先綁定，優先直接使用 OIDC；
否則使用已核准的短效 token bootstrap，仍由 Actions 發布，不改成本機發布。

使用者自行操作 npm／GitHub 網頁，不把密碼、OTP 或 token 貼到對話：

1. 建立最小權限、短效的 granular npm token，只授予首次建立此 scoped public
   套件需要的權限，配置必要的 CI 2FA bypass。若無法限制到未建立的單一套件，
   使用最小可用 scope 與最短有效期；政策不允許時停止，不放寬為長期 token。
2. 建立 **Repository Secret** `NPM_BOOTSTRAP_TOKEN`，並將 **Repository
   Variable** `NPM_BOOTSTRAP_ENABLED` 設為字串 `true`。workflow 沒有 environment，
   不使用 Environment Secret。
3. 合併首次 Release PR，讓 release-please 自動建立
   `pi-local-settings-v0.1.0` 並 dispatch 發布。守門只允許此套件的 0.1.0
   bootstrap，且 registry 必須回傳 404。其他 package 始終走 OIDC，不注入此 token。
4. Secret 僅注入 bootstrap job 的發布步驟，不注入安裝、測試或 release-please。
   bootstrap job 的 `id-token: write` 用於 provenance。
5. 成功後配置 OIDC，**撤銷 npm token、刪除 Secret 與 bootstrap variable**。
6. 使用下一個經確認的合法版本，由 Release PR／Actions 實際驗證 OIDC 發布。
   不重複發布既有版本；設定已儲存不等於 OIDC 發布已成功。

若預先 OIDC 與 token bootstrap 都不可行，停止並取得其他方案的同意。

## OIDC 設定

npm package Settings → Trusted Publisher → GitHub Actions：

| 欄位 | 值 |
| --- | --- |
| Organization or user | `chenwei791129` |
| Repository | `pi-extensions` |
| Workflow filename | `publish.yml` |
| Environment name | 留空 |
| Allowed actions | 明確允許直接 `npm publish` |

目前新 publisher 預設僅允許 `npm stage publish`，本流程使用直接發布，必須
另勾選允許 `npm publish`。新 publisher 目前須在兩天內完成首次成功發布，
否則需刪除後重新設定。使用 GitHub-hosted runner，public repo／public package
產生 provenance。正式 OIDC job 沒有 npm token；驗證成功後，建議 Publishing
access 設成「Require two-factor authentication and disallow tokens」。

## 失敗與恢復

- GitHub Release／tag 成功不代表 npm 發布成功。先查 Actions run 與 registry。
- dispatcher 對每個不同 ref 最多發送一次，某個 API 失敗仍嘗試其他 package，
  最後回報失敗清單；不自動盲目重試不確定是否已接受的 request。
- 若 dispatch 遺漏，可在 Actions 手動執行 `publish.yml`，**選擇既有 package tag**，
  不要在 main 執行，也不要移動 tag、重建同版本或重新合併 Release PR。
- CLI 恢復範例（先確認沒有進行中／已完成發布，且取得操作授權）：

  ```sh
  gh workflow run publish.yml --ref pi-local-settings-v0.1.0
  ```

- CI dispatch 遺漏時，對對應 Release PR branch 手動執行 `ci.yml`。
- 不重跑整個 release-please 當作 npm 發布重試：既有 Release 可能不再出現在
  action 的新建 release outputs 中。

## 發布後獨立驗收

1. 保留 Release PR／GitHub Release／Actions run URL 與 tag commit SHA。
2. registry 查詢，例如：

   ```sh
   npm view @chenwei791129/pi-local-settings@0.1.0 \
     name version keywords repository dist.tarball dist.attestations --json
   ```

   確認 public metadata、tarball 與 provenance，沒有非預期檔案或依賴。
3. 在暫存 HOME／`PI_CODING_AGENT_DIR`／cwd 的隔離環境安裝發布版本，準備合成
   skill／prompt／theme，明確授權 smoke test，不讀取開發者真實設定或呼叫付費模型。
4. 查看 <https://pi.dev/packages>，保留實際可驗證 URL。`pi-package` keyword
   只是探索資格，不等於已呈現；尚未索引時記錄為外部依賴，不重複發布版本刷新。
5. 首次 token 發布後完成清理，並以後續真實 OIDC 發布驗證成功，才宣稱整體
   發布策略完成。
