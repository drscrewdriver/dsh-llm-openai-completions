/**
 * Version-conditional import shim for the tool-call id brand.
 *
 * dsh-llm ≤ 0.1.1-rc.2 exports the brand as `CallId`; 0.1.2-rc.1+ renamed it
 * `ToolCallId` (the old name is gone from the 0.2.0 export surface). Static
 * named imports bind at parse time and cannot fall back, so the brand is
 * resolved once from the namespace at module load: `ToolCallId` wins when the
 * host provides it, `CallId` covers the 0.1.0/0.1.1 lines.
 * @module dsh-llm-openai-completions/adapter/tool-call-id
 */
import * as dshLlm from '@deepseek-ai/dsh-llm';
const faces = dshLlm;
/** The host's tool-call id brand constructor (CallId on ≤0.1.1, ToolCallId after). */
export const ToolCallId = (faces.ToolCallId ?? faces.CallId);
