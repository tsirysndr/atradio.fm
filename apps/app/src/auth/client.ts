import type { AuthState } from "../native";
let nextId = 0;
let activeOwner: symbol | undefined;
let send: ((script: string) => void) | undefined;
const waiting = new Map<
	number,
	{
		script: string;
		owner?: symbol;
		sent?: boolean;
		resolve: (state: any) => void;
		reject: (e: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();
export function prepareAuthRuntime(owner: symbol) {
	if (activeOwner === owner) return;
	if (activeOwner) detachAuthRuntime(activeOwner);
	activeOwner = owner;
}
export function attachAuthRuntime(
	owner: symbol,
	inject: (script: string) => void,
) {
	if (activeOwner !== owner) return;
	send = inject;
	for (const request of waiting.values()) {
		if (!request.sent) {
			request.owner = owner;
			request.sent = true;
			send(request.script);
		}
	}
}
export function detachAuthRuntime(
	owner: symbol,
	message = "Sign-in screen restarted. Please retry.",
) {
	if (activeOwner !== owner) return;
	send = undefined;
	activeOwner = undefined;
	for (const [id, request] of waiting) {
		if (request.owner === owner) {
			clearTimeout(request.timer);
			request.reject(new Error(message));
			waiting.delete(id);
		}
	}
}
export function receiveAuthMessage(data: string) {
	try {
		const message = JSON.parse(data);
		const request = waiting.get(message.id);
		if (!request) return;
		clearTimeout(request.timer);
		waiting.delete(message.id);
		if (message.error) request.reject(new Error(message.error));
		else request.resolve(message.result);
	} catch {
		/* Ignore unrelated WebView messages. */
	}
}
export function request<T = AuthState>(
	command: string,
	argument = "",
): Promise<T> {
	return new Promise((resolve, reject) => {
		const id = ++nextId;
		const script = `window.atradioAuth(${id},${JSON.stringify(command)},${JSON.stringify(argument)});true;`;
		const timer = setTimeout(() => {
			waiting.delete(id);
			reject(new Error("Sign-in did not respond. Please retry."));
		}, 20000);
		waiting.set(id, {
			script,
			resolve,
			reject,
			timer,
			owner: activeOwner,
			sent: !!send,
		});
		send?.(script);
	});
}

export const auth = (command: string, argument = "") =>
	request<AuthState>(command, argument);
