import type { AuthState } from "../native";
let nextId = 0;
let send: ((script: string) => void) | undefined;
const waiting = new Map<
	number,
	{
		script: string;
		resolve: (state: any) => void;
		reject: (e: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();
export function attachAuthRuntime(inject: (script: string) => void) {
	send = inject;
	for (const request of waiting.values()) send(request.script);
}
export function detachAuthRuntime() {
	send = undefined;
	for (const request of waiting.values()) {
		clearTimeout(request.timer);
		request.reject(new Error("Sign-in screen restarted. Please retry."));
	}
	waiting.clear();
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
		waiting.set(id, { script, resolve, reject, timer });
		send?.(script);
	});
}

export const auth = (command: string, argument = "") =>
	request<AuthState>(command, argument);
