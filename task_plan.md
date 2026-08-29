# task_plan.md 鈥?dsh-llm-openai-completions 瀵规帴 GitHub + 鐭矾璁剧疆瑙勭害

## Goal
1. 鎶婃湰鍦?`dsh-llm-openai-completions` 瀵规帴鍒?`https://github.com/drscrewdriver/dsh-llm-openai-completions`锛堢┖浠撳簱锛?2. 淇濊瘉鏈?**openai-completions 鐭矾璁剧疆瑙勭害**锛坄llm-openai-completions` 鍛藉悕绌洪棿 `{ enabled, providers }` 鐨勬寮忚鏍兼枃妗ｏ級

## 鐜扮姸
- 鏈湴鍒嗘敮 `feat/openai-completions-adapter`锛孒EAD `f5e0100`锛堥噸鍐欏悗锛夛紝宸ヤ綔鏍戝共鍑€
- 鍘嗗彶宸查噸鍐欎负 6 涓涔夋彁浜わ紝debug 鎻愪氦 fixup 鍚告敹锛沗index.ts` 鏃犱复鏃惰瘖鏂唬鐮?- 鐭矾璁剧疆瑙勭害宸插疄鐜板苟鏂囨。鍖栵紙`docs/settings-spec.md`锛?- GitHub 浠撳簱宸叉帴鏀讹細remote main = `f5e0100`锛坉efault_branch main锛?
## Phases
- [x] **Phase 1 璋冪爺**锛氳鏈湴鍏ㄩ儴婧愮爜锛涚‘璁ょ煭璺绾﹀疄鐜帮紙llm-openai-completions ns: enabled + providers锛宭lm/stream waterfall 鐭矾锛?- [x] **Phase 2 瑙勭害鏂囨。**锛氬啓 `docs/settings-spec.md`锛堢煭璺缃绾︼級锛汻EADME 寮曠敤锛沺ackage.json files 鏀跺綍 docs
- [x] **Phase 3 浠ｇ爜娓呯悊**锛氱Щ闄?index.ts 涓存椂 debug 璇婃柇浠ｇ爜锛堝啓 debug.json锛?- [x] **Phase 4 鍘嗗彶涓庨獙璇?*锛歵ypecheck/lint/test(24)/build 鍏ㄨ繃锛沬nteractive rebase 閲嶅啓涓?6 涓涔夋彁浜わ紙debug 骞跺叆锛?- [x] **Phase 5 鎺ㄩ€?*锛氬叧鑱?origin锛涙帹閫?feat 鍒嗘敮 鈫?GitHub main锛堢粡浠ｇ悊锛夛紝杩滅▼ HEAD = 鏈湴 HEAD `f5e0100`

## Decisions
- 鍘嗗彶閲嶅啓涓哄共鍑€璇箟鎻愪氦锛堢敤鎴风‘璁わ級锛歠eat + 3 fix + docs锛宒ebug 鎻愪氦 fixup 鍚告敹
- 鎺ㄥ埌 main锛堢敤鎴风‘璁わ級锛沚ackup 鍒嗘敮 backup/feat-openai-completions-adapter 淇濈暀鐜板満
- 鎺ㄩ€佽蛋浠ｇ悊 http://127.0.0.1:30987锛堢綉缁滅幆澧冮渶瑕佷唬鐞嗭紝鐩磋繛 GitHub 443 澶辫触锛?
## Errors
| Error | Attempt | Resolution |
|-------|---------|------------|
| rebase 662553f 鍐茬獊锛坉ebug fixup 杩涘叾鍚庣殑鎻愪氦瀵艰嚧琛ヤ竵涓婁笅鏂囧け閰嶏級 | 1 | debug 鎸夊叾鍘熷椤哄簭 fixup 杩涘墠涓€涓彁浜?cfda32d锛屼繚鎸?662553f 鍙簲鐢?|
| 鐩磋繛 GitHub 443 澶辫触锛圧PC connection reset锛?| 1 | 璧颁唬鐞?http://127.0.0.1:30987 鎺ㄩ€佹垚鍔?|
| `unknown tool ""`锛堢煭璺彃浠?+ mimo 瀛愪唬鐞嗗伐鍏疯皟鐢級 | 1 | 鏍瑰洜锛歵ranslate 鐨?tool-call name 琚悗缁?delta 鐨?null/绌轰覆瑕嗙洊 鈫?鍙洿鏂伴潪绌?name锛?6/26 娴嬭瘯 + e2e translate鈫抋ssembler 楠岃瘉 PASS锛涙彁浜?285c753 + 99f7a00锛屽凡鎺?main |

## 杩藉姞淇锛坲nknown tool ""锛?- **鏍瑰洜**锛歚src/adapter/translate.ts` 鐨?tool-call 瑙ｆ瀽鐢?`call.function?.name !== undefined` 鍒ゆ柇锛岀綉鍏筹紙mimo/vLLM/Qwen3锛夊湪鍚庣画 delta 閲嶅 `function.name: null` 鎴?`""` 鏃惰鐩栦簡棣栦釜 delta 鎹曡幏鐨勭湡鍚?鈫?harness 缁勮鍑虹┖鍚?tool-call 鈫?executor `unknown tool ""`銆?- **淇**锛氫粎闈炵┖瀛楃涓叉洿鏂?block.name锛?85c753锛夈€?- **楠岃瘉**锛? 涓柊鍗曟祴澶嶇幇+閿佸畾锛坣ull / 绌轰覆鍦烘櫙锛夛紱e2e 鑴氭湰 `scripts/verify-toolcall-name.mjs` 璧?translate鈫払lockAssembler 鐪熷疄閾捐矾 PASS锛坣ame=fs_write 淇濈暀锛夈€?- **mimo 璇存槑**锛歺iaomi/mimo 涓嶅湪鐭矾鍚嶅崟锛堣蛋 pi-ai 鍘熺敓 stream锛夛紝鍏?name 鏉ヨ嚜 pi-ai 鐨?toolcall_start 鎹曡幏锛屼笌鏈彃浠舵棤鍏筹紱鍚屽悕鐥囩姸鏄袱绉嶈矾寰勶紝鐭矾渚у凡淇€?
