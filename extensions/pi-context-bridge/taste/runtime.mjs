// Pi transport adapted from SpadeLushen/pi-gpt-with-taste (MIT).
import {readFileSync} from 'node:fs';
import {block, projectMessages} from './projection.mjs';
import {ensurePayloadInstructions} from './payload.mjs';

const registrations = new WeakSet();
const STATE = 'gpt-with-taste:state';
function overrides(ctx) {
  const entries = ctx.sessionManager.getBranch();
  return entries.findLast(entry => entry.type === 'custom' && entry.customType === STATE)?.data ?? {};
}
function report(ctx, text, level = 'info') {
  if (ctx.hasUI) ctx.ui.notify(text, level);
  else console.error(`GPT with Taste: ${text}`);
}
export function createTasteExtension({role = 'main', providers = ['openai', 'openai-codex'],
  modelIdPattern = /^gpt-/, completedResultTypes = []} = {}) {
  if (!['main', 'sub', 'independent'].includes(role)) throw new Error('GPT with Taste role must be main, sub or independent');
  const completed = new Set(completedResultTypes);
  return function tasteExtension(pi) {
    if (registrations.has(pi)) throw new Error('Load only one GPT with Taste entry per Pi session');
    registrations.add(pi);
    const manifest = JSON.parse(readFileSync(new URL('./texts.json', import.meta.url), 'utf8'));
    const texts = Object.fromEntries(Object.entries(manifest).map(([key, file]) => {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8').trim();
      if (!text) throw new Error(`Empty GPT with Taste source: ${file}`);
      return [key, text];
    }));
    const decision = ctx => {
      const state = overrides(ctx);
      modelIdPattern.lastIndex = 0;
      const active = state.enabled !== false && !!ctx.model && (providers === null || providers.includes(ctx.model.provider)) && modelIdPattern.test(ctx.model.id);
      modelIdPattern.lastIndex = 0;
      return {role, active, steering: state.steering !== false, completedResultTypes: completed};
    };
    // Pi's forced-prompt projection runs after context_with_system. Compose at
    // run start too, so model preset extensions cannot discard the shared block.
    pi.on('before_agent_start', (event, ctx) => {
      if (!decision(ctx).active) return;
      const instructions = block(texts, role);
      if (event.systemPrompt.includes(instructions)) return;
      return {systemPrompt: `${event.systemPrompt}\n\n${instructions}`};
    });
    let warned = false;
    pi.on('context_with_system', (event, ctx) => ({messages: projectMessages(event.messages, texts, decision(ctx))}));
    pi.on('before_provider_request', (event, ctx) => {
      if (!decision(ctx).active || !['openai-responses', 'openai-completions', 'openai-codex-responses'].includes(ctx.model.api)) return;
      const result = ensurePayloadInstructions(event.payload, block(texts, role));
      if (!result.supported && !warned) report(ctx,
        'Final-request guard cannot inspect this payload format. Pi system-section injection remains active; forced prompt replacement needs a provider-specific guard.', 'warning');
      warned = !result.supported;
      return result.payload;
    });
    pi.registerCommand('taste', {
      description: 'GPT with Taste: status, on, off, steer on, steer off, reset',
      handler: async (args, ctx) => {
        const command = args.trim() || 'status';
        const state = {...overrides(ctx)};
        if (command === 'on' || command === 'off') state.enabled = command === 'on';
        else if (command === 'steer on' || command === 'steer off') state.steering = command === 'steer on';
        else if (!['status', 'reset'].includes(command)) {
          report(ctx, 'Usage: /taste status|on|off|steer on|steer off|reset', 'warning');
          return;
        }
        if (command !== 'status') pi.appendEntry(STATE, command === 'reset' ? {} : state);
        const current = decision(ctx);
        report(ctx, `Role: ${role}\nActive: ${current.active}\nSteering: ${current.steering && role !== 'independent'}\nSource: ${new URL('./texts.json', import.meta.url).pathname}`);
      },
    });
  };
}
export default createTasteExtension();
