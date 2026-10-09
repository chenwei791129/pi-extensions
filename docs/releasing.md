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
4. 每個 tag 明確 dispatch `publish-<component>.yml`，由該 tag 的快照呼叫
   共用 `publish.yml`，驗證 caller 與 package 相符，再只發布該 workspace。
   不使用 `npm publish --workspaces`。
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
- 對每個 release 的 `<path>--tag_name` 明確 dispatch `publish-<component>.yml` 到該 tag。
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
4. 複製 `publish-pi-local-settings.yml` 為 `publish-<component>.yml`，調整 name、
   tag prefix、concurrency group 與固定 `package_path`；仍呼叫共用 `publish.yml`。
   不加入 `secrets: inherit`。該 wrapper 必須在首次版本 tag 的 commit 中存在。
5. 配置該 npm package 的 Trusted Publisher：填對應的 **caller filename**，例如
   `publish-pi-example.yml`，environment 留空。不要填 `publish.yml` 或
   `release-please.yml`。dispatcher 依 component 自動選取 wrapper；README 的
   row 使用此 wrapper 的 badge，可獨立顯示 main preview 檢查。
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

`publish-<component>.yml` 接受該套件的 tag push 與 workflow dispatch。
`publish.yml` 僅接受 `workflow_call`，不直接 dispatch。Tag 執行真正的發布；
main 手動 dispatch 只執行 preview，發布 job 會跳過，validation job 只有 read 權限。
其他 branch 的 preview 會被拒絕。README badge 明確篩選 main／workflow_dispatch，
代表該 package 最新手動 preview，不是 npm 發布成功，也不是其他 package 的狀態。
檢查包含 monorepo 的整合測試與該 workspace 的 tarball，而非只有該 package 的測試。

`scripts/release.ts` 會拒絕 branch 發布、未知／根 tag、caller/package 不符、版本不符、event SHA
不符及尚未納入 main 的 commit。它從 tag 中選擇唯一的已配置 package，輸出經
驗證的 workspace 路徑。validate job 重跑 checks／pack，發布 job 再確認來源，
以 public access／provenance 發布。不同版本的同一 package 不會同時發布；
不同 package 使用各自的 concurrency group。

## 首次 npm 發布與 staged bootstrap

再次查證 [npm Staged Publishing 文件](https://docs.npmjs.com/staged-publishing)
與 [Trusted Publishing 文件](https://docs.npmjs.com/trusted-publishers)。OIDC 需
Node >=22.14.0、npm >=11.5.1；staging 需 npm >=11.15.0。bootstrap workflow
使用 Node 24.14.1，透過 `npm exec` 固定 npm **11.18.0**，不安裝全域工具。
本機登入不是 Actions 發布的必要條件。

首次 `0.1.0` 已有 GitHub Release／tag，但原直接發布遭 npm 2FA 拒絕。
保留 `pi-local-settings-v0.1.0` 指向 `95ee14c169b60416bc959fa7f2a75c23e044525d`，
**不移動 tag、不重跑它的舊 workflow**。新 `.github/workflows/stage-bootstrap.yml`
只接受 main 的手動 dispatch，且只允許此套件的首次 `0.1.0`。

使用者自行操作 npm／GitHub 網頁，不把密碼、OTP 或 token 貼到對話：

1. 建立最小範圍、短效的 granular token，權限選 **Read and write (stage only)**。
   `npm stage publish` 不需要 2FA，**不用勾 Bypass two-factor authentication**；
   不停用帳號的 2FA。若未建立的單一套件無法選取，使用最小可用 scope。
2. 建立 **Repository Secret** `NPM_BOOTSTRAP_TOKEN`，**Repository Variable**
   `NPM_BOOTSTRAP_ENABLED` 設為字串 `true`。沒有 environment，不用 Environment Secret。
3. 經維護者授權，執行 `stage-bootstrap.yml`，ref 選 **main**。守門確認事件 SHA、
   main ancestry、原 tag SHA、套件名稱／版本，並比較 main 與原 tag 的 npm tarball
   integrity，必須完全一致。registry 必須為 404；placeholder／已發布套件會阻止重傳。
4. Actions 用 `npm stage publish` 上傳 public／provenance stage。Secret 僅注入
   此步驟，不注入安裝、測試或 release-please；不在本機上傳。Stage 不是公開發布。
   首次 staging 會建立公開的 **`0.0.0-stage` placeholder**，不代表 `0.1.0` 已上線。
5. 使用者登入 npm 的 **Staged Packages** 分頁，檢查套件、版本與內容後，按
   **Approve** 並親自完成 2FA。這一步才讓 `0.1.0` 公開；不把 OTP 交給 CI。
6. 公開後完成下方驗收，再設定 OIDC，**撤銷 token、刪除 Secret／bootstrap variable**。
   使用下一個經確認的合法版本，實際驗證 package caller／共用 workflow 的 OIDC 發布。

Bootstrap provenance 記錄的是 **main 的 automation commit／stage-bootstrap.yml**，
不是原 release tag 的 commit。守門的完整 tarball integrity 比對保證發布內容與
原 tag 一致；不偽造 `GITHUB_SHA`。驗收時保留兩個 SHA、workflow URL 與 integrity。

其他 package／後續版本不取得 bootstrap token。新的 `publish.yml` 僅走 OIDC，
bootstrap 旗標仍開啟時會阻止此套件的後續版本，避免切換前誤發布。

## OIDC 設定

npm package Settings → Trusted Publisher → GitHub Actions：

| 欄位 | 值 |
| --- | --- |
| Organization or user | `chenwei791129` |
| Repository | `pi-extensions` |
| Workflow filename | `publish-pi-local-settings.yml`（其他 package 填自己的 caller） |
| Environment name | 留空 |
| Allowed actions | 明確允許直接 `npm publish` |

目前新 publisher 預設僅允許 `npm stage publish`，本流程使用直接發布，必須
另勾選允許 `npm publish`。新 publisher 目前須在兩天內完成首次成功發布，
否則需刪除後重新設定。使用 GitHub-hosted runner，public repo／public package
產生 provenance。正式 OIDC job 沒有 npm token；驗證成功後，建議 Publishing
access 設成「Require two-factor authentication and disallow tokens」。

### 由共用入口切換至 package caller

`0.1.1` 已實際驗證舊 `publish.yml` 的 OIDC 發布；新的 caller 尚未真正發布。
GitHub reusable workflow 的 npm 驗證綁定 **calling workflow**，父／子都必須允許
`id-token: write`，不能只綁定內含 publish 指令的檔案。

本次只做 `ci:`／`docs:` 變更與 main preview，**不建立新的 release tag**，也不
修改既有 tag。新 caller 的 publisher 應在下一次正式 release 前設定，且兩天內
完成其首次 OIDC 發布；不要現在僅為 badge 重發既有版本或觸發新 release。
若需要保留舊 tag 的恢復能力，可暫留已驗證的 `publish.yml` publisher；新 caller
成功後再移除舊綁定。既有 `0.1.0`／`0.1.1` tag 沒有新 wrapper，不能以新 wrapper
執行它們，必要時先查原 run 再決定恢復方式。

Main preview 範例（不建立 tag、不上傳 stage、不發 npm）：

```sh
gh workflow run publish-pi-local-settings.yml --ref main
```

## 失敗與恢復

- GitHub Release／tag 成功不代表 npm 發布成功。先查 Actions run 與 registry。
- dispatcher 對每個不同 ref 最多發送一次，某個 API 失敗仍嘗試其他 package，
  最後回報失敗清單；不自動盲目重試不確定是否已接受的 request。
- 新 caller 的 dispatch 遺漏時，可手動執行對應 `publish-<component>.yml`，
  **選擇已包含此 wrapper 的既有 package tag**。Main 僅 preview，不是真正恢復發布；
  不要移動 tag、重建同版本或重新合併 Release PR。
- CLI 恢復範例（先確認沒有進行中／已完成發布，且取得操作授權）：

  ```sh
  # Set an existing tag that contains the new package caller.
  gh workflow run publish-pi-local-settings.yml \
    --ref "${EXISTING_TAG:?Set an existing version tag}"
  ```

- 首次 stage 尚未建立且 registry 為 404 時，經授權才可執行：

  ```sh
  gh workflow run stage-bootstrap.yml --ref main
  ```

  若已建立 stage／`0.0.0-stage` placeholder，先到 npm 檢查既有 stage，核准或拒絕，
  **不要重跑 staging**。拒絕後的 placeholder 也會使守門停止，需另行確認恢復方案。
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
5. Stage job 成功僅代表等待核准；先確認公開的 `0.1.0` metadata 與 tarball，
   再完成 bootstrap 清理，並以後續真實 OIDC 發布驗證成功，才宣稱整體發布策略完成。
