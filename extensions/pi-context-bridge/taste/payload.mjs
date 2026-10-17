// Adapted from SpadeLushen/pi-gpt-with-taste/src/payload.ts, MIT.
// Only append a missing block; preserve host instructions, tools and metadata.
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value);
function instructionText(message) {
  if (!record(message) || !['system', 'developer'].includes(message.role)) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content.map(part => record(part) && ['text', 'input_text'].includes(part.type) &&
    typeof part.text === 'string' ? part.text : '').join('\n');
}
export function ensurePayloadInstructions(payload, block) {
  if (!record(payload) || typeof payload.model !== 'string') return {supported: false};
  if (Array.isArray(payload.input)) {
    const existing = payload.instructions;
    if (existing != null && typeof existing !== 'string') return {supported: false};
    if ((typeof existing === 'string' && existing.includes(block)) ||
        payload.input.some(message => instructionText(message).includes(block))) return {supported: true};
    return {supported: true, payload: {...payload,
      instructions: existing ? `${existing}\n\n${block}` : block}};
  }
  if (Array.isArray(payload.messages)) {
    const messages = payload.messages;
    if (messages.some(message => instructionText(message).includes(block))) return {supported: true};
    const index = messages.findIndex(message => record(message) && ['system', 'developer'].includes(message.role));
    const message = messages[index];
    if (!record(message)) return {supported: false};
    let content;
    if (typeof message.content === 'string') content = message.content ? `${message.content}\n\n${block}` : block;
    else if (Array.isArray(message.content)) content = [...message.content, {type: 'text', text: block}];
    else return {supported: false};
    const updated = messages.slice();
    updated[index] = {...message, content};
    return {supported: true, payload: {...payload, messages: updated}};
  }
  return {supported: false};
}
