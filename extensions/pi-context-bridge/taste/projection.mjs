// Adapted from SpadeLushen/pi-gpt-with-taste, MIT; see THIRD_PARTY_LICENSE.
export const SECTION = 'gpt_with_taste';
export const STEER_TYPE = 'gpt-with-taste:steer';
export const block = (texts, role) => `<gpt-with-taste>\n${texts[role].trim()}\n</gpt-with-taste>`;

export function projectMessages(input, texts, {role, active, steering, completedResultTypes}) {
  const messages = input.filter(message =>
    !(message.role === 'custom' && message.customType === STEER_TYPE)).map(message => {
    if (message.role !== 'system' || !message.sections || !(SECTION in message.sections)) return message;
    const sections = {...message.sections};
    delete sections[SECTION];
    return {...message, sections};
  });
  if (!active) return messages;
  if (messages[0]?.role !== 'system') throw new Error('GPT with Taste requires Pi\'s leading system message');
  messages[0] = {...messages[0], sections: {...messages[0].sections, [SECTION]: block(texts, role)}};
  if (!steering || role === 'independent') return messages;
  const lastAssistant = messages.findLastIndex(message => message.role === 'assistant');
  return messages.flatMap((message, index) => {
    let route;
    if (index > lastAssistant) {
      if (message.role === 'user') route = role === 'sub' ? 'sub' : 'user';
      else if (role === 'main' && message.role === 'custom' && completedResultTypes.has(message.customType)) route = 'agent';
    }
    if (!route) return [message];
    const key = {user: 'userSteer', sub: 'subSteer', agent: 'agentSteer'}[route];
    return [message, {role: 'custom', customType: STEER_TYPE,
      content: `<gpt-with-taste-${route}-steer>\n${texts[key].trim()}\n</gpt-with-taste-${route}-steer>`,
      display: false, details: {route}, timestamp: message.timestamp}];
  });
}
