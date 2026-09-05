import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import type {
  SupportTeam,
  SupportThread,
  ThreadMessage,
  ThreadStatus,
} from "./tenancy-types";
import { getCustomer } from "./tenancy-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "support-threads.json");

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureStore(): SupportThread[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(STORE_FILE)) {
      const seed = seedThreads();
      writeFileSync(STORE_FILE, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    const raw = readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw) as SupportThread[];
  } catch {
    return seedThreads();
  }
}

function persist(threads: SupportThread[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(threads, null, 2), "utf8");
}

function seedThreads(): SupportThread[] {
  const now = Date.now();
  const amtel = getCustomer("cust-amtel");
  const orbit = getCustomer("cust-orbit");

  const t1: SupportThread = {
    id: "thread-amtel-1",
    customerId: "cust-amtel",
    customerName: amtel?.name || "Amtelkom",
    clientUserId: "acc-client-amtel",
    clientUserName: "Amtelkom Admin",
    clientUserEmail: "admin@amtelkom.onmicrosoft.com",
    team: "technical",
    status: "queued",
    assignedAgentId: null,
    assignedAgentName: null,
    subject: "Need help with user sync",
    createdAt: new Date(now - 3600000).toISOString(),
    updatedAt: new Date(now - 3500000).toISOString(),
    messages: [
      {
        id: uid(),
        sender: "system",
        senderName: "System",
        text: "Chat started · Technical Support queue",
        createdAt: new Date(now - 3600000).toISOString(),
        readByClient: true,
        readByAgent: false,
      },
      {
        id: uid(),
        sender: "client",
        senderName: "Amtelkom Admin",
        text: "Hello, User Sync is failing for 6 blocked accounts. Can Technical help?",
        createdAt: new Date(now - 3500000).toISOString(),
        readByClient: true,
        readByAgent: false,
      },
    ],
  };

  const t2: SupportThread = {
    id: "thread-orbit-bill",
    customerId: "cust-orbit",
    customerName: orbit?.name || "Orbit Digital",
    clientUserId: "acc-client-orbit",
    clientUserName: "Orbit Admin",
    clientUserEmail: "admin@orbitdigital.onmicrosoft.com",
    team: "billing",
    status: "active",
    assignedAgentId: "acc-bill-lina",
    assignedAgentName: "Lina Farouk",
    subject: "Invoice question",
    createdAt: new Date(now - 7200000).toISOString(),
    updatedAt: new Date(now - 600000).toISOString(),
    messages: [
      {
        id: uid(),
        sender: "system",
        senderName: "System",
        text: "Chat started · Billing Support queue",
        createdAt: new Date(now - 7200000).toISOString(),
        readByClient: true,
        readByAgent: true,
      },
      {
        id: uid(),
        sender: "client",
        senderName: "Orbit Admin",
        text: "Hi, can you explain the September invoice total?",
        createdAt: new Date(now - 7000000).toISOString(),
        readByClient: true,
        readByAgent: true,
      },
      {
        id: uid(),
        sender: "agent",
        senderName: "Lina Farouk",
        text: "Hi, my name is Lina from netrichtechnologies Billing. I can help you with that. Your September invoice includes 42 Business Premium seats billed monthly.",
        createdAt: new Date(now - 6800000).toISOString(),
        readByClient: false,
        readByAgent: true,
      },
    ],
  };

  return [t1, t2];
}

export function listThreads(filter?: {
  customerId?: string;
  clientUserId?: string;
  team?: SupportTeam;
  status?: ThreadStatus;
  /** Partner-only: allow unscoped list */
  allowUnscoped?: boolean;
}): SupportThread[] {
  // Fail closed — refuse unscoped reads unless partner explicitly allows
  if (
    !filter?.customerId &&
    !filter?.team &&
    !filter?.allowUnscoped
  ) {
    return [];
  }
  let threads = ensureStore();
  if (filter?.customerId) {
    threads = threads.filter((t) => t.customerId === filter.customerId);
  }
  if (filter?.clientUserId) {
    threads = threads.filter((t) => t.clientUserId === filter.clientUserId);
  }
  if (filter?.team) {
    threads = threads.filter((t) => t.team === filter.team);
  }
  if (filter?.status) {
    threads = threads.filter((t) => t.status === filter.status);
  }
  return threads.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getThread(id: string): SupportThread | undefined {
  return ensureStore().find((t) => t.id === id);
}

export function createThread(input: {
  customerId: string;
  customerName: string;
  clientUserId: string;
  clientUserName: string;
  clientUserEmail: string;
  team: SupportTeam;
  subject?: string;
  firstMessage: string;
}): SupportThread {
  const threads = ensureStore();
  const now = new Date().toISOString();
  const thread: SupportThread = {
    id: uid(),
    customerId: input.customerId,
    customerName: input.customerName,
    clientUserId: input.clientUserId,
    clientUserName: input.clientUserName,
    clientUserEmail: input.clientUserEmail,
    team: input.team,
    status: "queued",
    assignedAgentId: null,
    assignedAgentName: null,
    subject: input.subject || "Support request",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: uid(),
        sender: "system",
        senderName: "System",
        text: `Chat started · ${input.team === "billing" ? "Billing" : "Technical"} Support queue`,
        createdAt: now,
        readByClient: true,
        readByAgent: false,
      },
      {
        id: uid(),
        sender: "client",
        senderName: input.clientUserName,
        text: input.firstMessage,
        createdAt: now,
        readByClient: true,
        readByAgent: false,
      },
    ],
  };
  threads.unshift(thread);
  persist(threads);
  return thread;
}

export function addMessage(
  threadId: string,
  message: Omit<ThreadMessage, "id" | "createdAt">
): SupportThread | null {
  const threads = ensureStore();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx < 0) return null;
  const msg: ThreadMessage = {
    ...message,
    id: uid(),
    createdAt: new Date().toISOString(),
  };
  threads[idx].messages.push(msg);
  threads[idx].updatedAt = msg.createdAt;
  if (threads[idx].status === "resolved" && message.sender !== "system") {
    threads[idx].status = "active";
  }
  persist(threads);
  return threads[idx];
}

export function claimThread(
  threadId: string,
  agent: { id: string; name: string; team: SupportTeam }
): SupportThread | null {
  const threads = ensureStore();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx < 0) return null;
  const thread = threads[idx];
  // Hard team isolation — technical cannot claim billing and vice versa
  if (thread.team !== agent.team) {
    return null;
  }
  const teamLabel = agent.team === "billing" ? "Billing" : "Technical";
  const now = new Date().toISOString();
  thread.assignedAgentId = agent.id;
  thread.assignedAgentName = agent.name;
  thread.status = "active";
  thread.updatedAt = now;
  thread.messages.push({
    id: uid(),
    sender: "agent",
    senderName: agent.name,
    text: `Hi, my name is ${agent.name} from netrichtechnologies ${teamLabel} Support. What can I help you with today?`,
    createdAt: now,
    readByClient: false,
    readByAgent: true,
  });
  persist(threads);
  return thread;
}

export function resolveThread(threadId: string): SupportThread | null {
  const threads = ensureStore();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  threads[idx].status = "resolved";
  threads[idx].updatedAt = now;
  threads[idx].messages.push({
    id: uid(),
    sender: "system",
    senderName: "System",
    text: "Chat marked as resolved.",
    createdAt: now,
    readByClient: false,
    readByAgent: true,
  });
  persist(threads);
  return threads[idx];
}

export function markThreadRead(
  threadId: string,
  reader: "client" | "agent"
): SupportThread | null {
  const threads = ensureStore();
  const idx = threads.findIndex((t) => t.id === threadId);
  if (idx < 0) return null;
  threads[idx].messages = threads[idx].messages.map((m) => ({
    ...m,
    readByClient: reader === "client" ? true : m.readByClient,
    readByAgent: reader === "agent" ? true : m.readByAgent,
  }));
  persist(threads);
  return threads[idx];
}

export function unreadForClient(customerId: string, clientUserId: string): number {
  return listThreads({ customerId }).reduce((sum, t) => {
    // Stay inside this tenant only; prefer threads owned by this client user
    if (t.customerId !== customerId) return sum;
    if (t.clientUserId && t.clientUserId !== clientUserId) return sum;
    return (
      sum +
      t.messages.filter((m) => m.sender !== "client" && !m.readByClient).length
    );
  }, 0);
}

export function unreadForAgent(team?: SupportTeam): number {
  return listThreads(team ? { team } : { allowUnscoped: true }).reduce((sum, t) => {
    return (
      sum +
      t.messages.filter((m) => m.sender === "client" && !m.readByAgent).length
    );
  }, 0);
}
