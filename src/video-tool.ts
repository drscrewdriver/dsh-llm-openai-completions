/**
 * The `read_video` tool: attach a local video file into the session context
 * as a native file block, so a taken-over multimodal model receives it as a
 * `video_url` data-URI part on the next request. The tool itself performs no
 * API call — the video travels with the session's own model traffic, which
 * keeps billing, credentials, and history in one place.
 *
 * Definition is hand-assembled in the compiled JSON-Schema subset (the same
 * shape `@deepseek-ai/dsh-tools`' `defineTool` emits) so this module needs no
 * dsh-tools dependency and the plugin's peer/engines matrix stays untouched.
 * The deferred-context seam (`exec.deferContext`) is a 0.2.0 ToolRunContext
 * feature: on hosts without it the tool says so in its result instead of
 * attaching (graceful degradation, never a load failure).
 * @module dsh-llm-openai-completions/video-tool
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, extname, isAbsolute, join } from 'node:path'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { LlmError } from '@deepseek-ai/dsh-llm'

const execFileAsync = promisify(execFile)

/** Media types inlinable on the openai-completions wire, by extension. */
const VIDEO_MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
}

/** The adapter refuses to inline any video above 20 MB — stay under it. */
const HARD_MAX_BYTES = 19 * 1024 * 1024

/** The provider's documented per-request video budget; above this, warn. */
const SOFT_MAX_BYTES = 10 * 1024 * 1024

/** Verbatim-file commit seam (the attachment store's own shape). */
export interface VideoSaveFile {
  (input: { data: Uint8Array; name: string }): Promise<{ attachmentId: string; name: string; bytes: number }>
}

/** Runtime toggles read live so settings edits apply without a remount. */
export interface VideoToolGate {
  (): { videoTool: boolean }
}

/** One ffmpeg re-encode attempt: scale to `height`, fast x264; undefined on failure. */
async function compressVideo(absPath: string, height: number, crf: number): Promise<Uint8Array | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-oc-video-'))
  try {
    const outPath = join(dir, `${basename(absPath, extname(absPath))}-${height}p.mp4`)
    await execFileAsync('ffmpeg', [
      '-y', '-i', absPath,
      '-vf', `scale=-2:${height}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      outPath,
    ], { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 })
    return await readFile(outPath)
  } catch {
    return undefined
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Whether ffmpeg is usable on PATH (checked once per process). */
let ffmpegUsable: boolean | undefined
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegUsable === undefined) {
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 10_000 })
      ffmpegUsable = true
    } catch {
      ffmpegUsable = false
    }
  }
  return ffmpegUsable
}

/**
 * Build one user-role message for the deferred-context seam. Prefers the
 * host's `createUserMessage` (stable identity + freeze); a host without that
 * export receives a structurally equivalent literal.
 */
async function userMessageOf(content: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
  try {
    const llm = (await import('@deepseek-ai/dsh-llm')) as unknown as {
      createUserMessage?: (input: unknown) => unknown
    }
    if (typeof llm.createUserMessage === 'function') {
      return llm.createUserMessage({
        content,
        source: { kind: 'llm-openai-completions/video' },
      }) as Record<string, unknown>
    }
  } catch {
    // Fall through to the literal below.
  }
  return { role: 'user', content, source: { kind: 'llm-openai-completions/video' } }
}

/**
 * Build the registry-ready `read_video` definition.
 * @param resolveAttachments - lazy attachment-store lookup (it may register
 *   after apply; media-bearing executions only).
 * @param gate - live config read (the `videoTool` toggle applies immediately).
 */
export function buildVideoTool(resolveAttachments: () => unknown, gate: VideoToolGate): Record<string, unknown> {
  return {
    name: 'read_video',
    description:
      'Attach a local video file into the conversation context as a native video content part, ' +
      'so the current model can watch and analyze it directly. The video must be mp4/webm/mov/mkv. ' +
      'Files above 10 MB are re-encoded to 540p with ffmpeg when available (providers recommend <= 10 MB; ' +
      'the hard inline ceiling is 19 MB). Use this instead of read_image for any video file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path (or path relative to the session directory) of the video file.',
        },
        note: {
          type: 'string',
          description: 'Optional one-line instruction shipped alongside the video, e.g. what to look for.',
        },
      },
      required: ['path'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          bytes: { type: 'integer' },
          mediaType: { type: 'string' },
          attachmentId: { type: 'string' },
          attachedToContext: { type: 'boolean' },
          compressed: { type: 'boolean' },
          warning: { type: 'string' },
        },
      },
      render: (_args: unknown, value: Record<string, unknown>) => {
        const lines = [
          `Video "${String(value.name)}" (${(Number(value.bytes) / (1024 * 1024)).toFixed(1)} MB, ${String(value.mediaType)}) was attached to the conversation as a native video part; analyze it in your reply.`,
        ]
        if (value.compressed === true) lines.push('The file was re-encoded to fit the inline budget.')
        if (typeof value.warning === 'string') lines.push(value.warning)
        return [{ type: 'text', text: lines.join(' ') }]
      },
    },
    async execute(args: { path: string; note?: string }, exec: { deferContext?: (message: unknown) => void; agent?: { session?: { header?: { cwd?: string } } } }) {
      if (!gate().videoTool) {
        throw new LlmError('read_video is disabled by the llm-openai-completions settings (videoTool).', 'TOOL_DISABLED')
      }
      const absPath = isAbsolute(args.path)
        ? args.path
        : join(exec.agent?.session?.header?.cwd ?? process.cwd(), args.path)
      const info = await stat(absPath).catch(() => undefined)
      if (info === undefined) throw new Error(`video file not found: ${absPath}`)
      const mediaType = VIDEO_MEDIA_TYPES[extname(absPath).toLowerCase()]
      if (mediaType === undefined) {
        throw new Error(
          `"${basename(absPath)}" is not an inlinable video type (supported: mp4/webm/mov/mkv). Convert it first, then retry.`)
      }

      let data: Uint8Array = await readFile(absPath)
      let compressed = false
      if (data.byteLength > SOFT_MAX_BYTES && await hasFfmpeg()) {
        const candidate = await compressVideo(absPath, 540, 28)
        if (candidate !== undefined && candidate.byteLength < data.byteLength) {
          data = candidate
          compressed = true
        }
      }
      if (data.byteLength > HARD_MAX_BYTES) {
        if (!compressed && !await hasFfmpeg()) {
          throw new Error(
            `video "${basename(absPath)}" exceeds the ${Math.floor(HARD_MAX_BYTES / (1024 * 1024))} MB inline ceiling and ffmpeg is unavailable to re-encode it; install ffmpeg or provide a smaller file.`)
        }
        const fallback = await compressVideo(absPath, 360, 32)
        if (fallback === undefined || fallback.byteLength > HARD_MAX_BYTES) {
          throw new Error(
            `video "${basename(absPath)}" stays above the ${Math.floor(HARD_MAX_BYTES / (1024 * 1024))} MB inline ceiling even after 540p/360p re-encodes; trim or split it first.`)
        }
        data = fallback
        compressed = true
      }
      let warning: string | undefined
      if (data.byteLength > SOFT_MAX_BYTES) {
        warning = `Note: the attached video is ${(data.byteLength / (1024 * 1024)).toFixed(1)} MB, above the provider's recommended 10 MB; the request may be refused by the model backend.`
      }

      const store = resolveAttachments() as { saveFile?: VideoSaveFile } | undefined
      if (store?.saveFile === undefined) {
        throw new LlmError('read_video requires an attachment store with verbatim file support.', 'UNSUPPORTED_CONTENT')
      }
      const ref = await store.saveFile({ data, name: basename(absPath) })

      // The deferred-context seam is the only channel that keeps the video
      // structural (tool-role messages serialize as flat text on the wire).
      if (typeof exec.deferContext !== 'function') {
        return {
          name: ref.name,
          bytes: data.byteLength,
          mediaType,
          attachmentId: ref.attachmentId,
          attachedToContext: false,
          warning: 'This host does not support deferred tool context, so the video could not be attached; upgrade the harness to 0.2.0+.',
        }
      }
      const message = await userMessageOf([
        {
          type: 'text',
          text: `Video "${ref.name}" (${(data.byteLength / (1024 * 1024)).toFixed(1)} MB, ${mediaType}) attached below as a native video part.${args.note ? ` Focus: ${args.note}` : ''}`,
        },
        { type: 'file', attachment: ref },
      ])
      exec.deferContext(message)

      return {
        name: ref.name,
        bytes: data.byteLength,
        mediaType,
        attachmentId: ref.attachmentId,
        attachedToContext: true,
        ...(compressed ? { compressed: true } : {}),
        ...(warning !== undefined ? { warning } : {}),
      }
    },
    presentCall: (args: { path: string }) => ({
      card: 'generic',
      title: `read_video ${basename(args.path)}`,
      kind: 'execute',
      rawInput: args.path,
    }),
  }
}
