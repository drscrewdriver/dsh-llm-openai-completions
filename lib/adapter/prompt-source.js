/** Registry holding the current source and applying it to requests. */
export class PromptSourceRegistry {
    source;
    /** Register a prompt source; returns a disposer that unregisters it. */
    register(source) {
        this.source = source;
        return () => {
            if (this.source === source)
                this.source = undefined;
        };
    }
    /** The current source, if any. */
    peek() {
        return this.source;
    }
    /** The leading system message of a message list, if one exists. */
    static leadingSystem(messages) {
        return messages.find((message) => message.role === 'system');
    }
    /**
     * Apply the registered source to one request. Returns the given options
     * untouched when no source is registered (contract 1) or when nothing is
     * replaced. Never mutates the input options object.
     */
    apply(options, provider) {
        const source = this.source;
        if (source === undefined)
            return options;
        const model = String(options.model);
        // System prompt: the explicit channel wins; otherwise the leading system
        // message. Replacement is written back to the same channel (contract 5).
        const explicitSystem = typeof options.system === 'string' ? options.system : undefined;
        const leading = explicitSystem === undefined ? PromptSourceRegistry.leadingSystem(options.messages) : undefined;
        const systemText = explicitSystem
            ?? leading?.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('');
        if (systemText !== undefined && systemText.length > 0) {
            const replaced = source.resolveSystem({ provider, model, system: systemText });
            if (replaced !== undefined && replaced !== systemText) {
                if (explicitSystem !== undefined) {
                    options = { ...options, system: replaced };
                }
                else if (leading !== undefined) {
                    const nextMessages = options.messages.map((message) => message === leading
                        ? { ...message, content: [{ type: 'text', text: replaced }] }
                        : message);
                    options = { ...options, messages: nextMessages };
                }
            }
        }
        // Tool descriptions: per-tool replacement, name/parameters untouched.
        if (options.tools !== undefined && options.tools.length > 0) {
            let nextTools;
            options.tools.forEach((tool, index) => {
                const replaced = source.resolveToolDescription({
                    provider, model, toolName: tool.name, description: tool.description,
                });
                if (replaced !== undefined && replaced !== tool.description) {
                    nextTools ??= [...options.tools];
                    nextTools[index] = { ...tool, description: replaced };
                }
            });
            if (nextTools !== undefined)
                options = { ...options, tools: nextTools };
        }
        return options;
    }
}
