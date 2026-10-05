type IdBrand = (id: string) => import('@deepseek-ai/dsh-llm').ToolCallId;
/** The host's tool-call id brand constructor (CallId on ≤0.1.1, ToolCallId after). */
export declare const ToolCallId: IdBrand;
export {};
