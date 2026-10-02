// Seven ASCII columns in every state; animation never moves adjacent text.
export const PET_WIDTH = 7;
export const PET_GAP = 2;
const TAILS = ["~", "-", "/", "-"];

export function petFrame(active: boolean, tick: number, reducedMotion = false): string {
	if (!active) return "=-.-= z";
	if (reducedMotion) return "=^.^=~ ";
	const face = tick % 32 === 31 ? "=-.-=" : "=^.^=";
	return `${face}${TAILS[Math.floor(tick / 3) % TAILS.length]} `;
}
