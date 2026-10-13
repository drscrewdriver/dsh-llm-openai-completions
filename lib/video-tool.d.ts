/** Verbatim-file commit seam (the attachment store's own shape). */
export interface VideoSaveFile {
    (input: {
        data: Uint8Array;
        name: string;
    }): Promise<{
        attachmentId: string;
        name: string;
        bytes: number;
    }>;
}
/** Runtime toggles read live so settings edits apply without a remount. */
export interface VideoToolGate {
    (): {
        videoTool: boolean;
    };
}
/**
 * Build the registry-ready `read_video` definition.
 * @param resolveAttachments - lazy attachment-store lookup (it may register
 *   after apply; media-bearing executions only).
 * @param gate - live config read (the `videoTool` toggle applies immediately).
 */
export declare function buildVideoTool(resolveAttachments: () => unknown, gate: VideoToolGate): Record<string, unknown>;
