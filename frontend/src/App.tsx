
import { useState ,type FormEvent} from "react";
import {
  Activity,
  Building2,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  KeyRound,
  ArrowRight,
  PlayCircle,
} from "lucide-react";

import { apiRequest } from "./lib/api";

type Page = "overview" | "users" | "plans" | "history" | "playground";

type Account = {
  id: string;
  name: string;
};

type Usage = {
  month?: string;
  account: {
    planCode?: string;
    monthlyAllowance: number;
    maxPerRequest?: number;
    consumedUnits: number;
    remainingUnits: number;
  };
  users: Array<{
    id: string;
    externalId?: string;
    planCode?: string;
    monthlyAllowance: number;
    consumedUnits: number;
    remainingUnits: number;
  }>;
};

type User = {
  id: string;
  externalId: string;
  planCode?: string;
};

type Plan = {
  id: string;
  code: string;
  name: string;
  type: "account" | "user";
  monthlyAllowance: number;
  maxPerRequest: number;
  isSystem?: boolean;
};

type HistoryRecord = {
  id: string;
  requestId: string;
  userId: string;
  units: number;
  status: "accepted" | "rejected";
  rejectionLevel: string | null;
  rejectionRule: string | null;
  processedAt: string;
};

type HistoryResponse = {
  history: HistoryRecord[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "plans", label: "Plans", icon: CreditCard },
  { id: "history", label: "History", icon: History },
  { id: "playground", label: "API Playground", icon: PlayCircle },
] as const;

const formatNumber = (value: number) =>
  Number(value ?? 0).toLocaleString("en-US");

function ProgressBar({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const percentage =
    total > 0
      ? Math.min(100, Math.max(0, (used / total) * 100))
      : 0;

  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#E9EDF2]">
      <div
        className="h-full rounded-full bg-[#A5B6A3] transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [account, setAccount] = useState<Account | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyUserId, setHistoryUserId] = useState("");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newExternalId, setNewExternalId] = useState("");
  const [newUserPlan, setNewUserPlan] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [userMessage, setUserMessage] = useState("");
  const [changingUserId, setChangingUserId] = useState("");
  const [targetPlanId, setTargetPlanId] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planCode, setPlanCode] = useState("");

  const [planType, setPlanType] = useState<"user" | "account">("user");

  const [monthlyAllowance, setMonthlyAllowance] = useState("500");
  const [maxPerRequest, setMaxPerRequest] = useState("50");

  const [savingCustomPlan, setSavingCustomPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [editingPlanId, setEditingPlanId] = useState("");
  const [editPlanName, setEditPlanName] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editMaximum, setEditMaximum] = useState("");
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [selectedAccountPlanId, setSelectedAccountPlanId] = useState("");
  const [savingAccountPlan, setSavingAccountPlan] = useState(false);
  const [consumeUserId, setConsumeUserId] = useState("");
const [consumeUnits, setConsumeUnits] = useState("5");
const [consumeRequestId, setConsumeRequestId] = useState<string>(
  () => crypto.randomUUID()
);
const [sendingConsume, setSendingConsume] = useState(false);

type ConsumeResult = {
  status: "accepted" | "rejected";
  replayed: boolean;
  rejectionLevel?: string | null;
  rejectionRule?: string | null;
  accountRemaining?: number;
  userRemaining?: number;
};

const [consumeResult, setConsumeResult] =
  useState<ConsumeResult | null>(null);
  const [accountPlanMessage, setAccountPlanMessage] = useState("");
  
  function startEditingPlan(plan: Plan) {
  setEditingPlanId(plan.id);
  setEditPlanName(plan.name);
  setEditMonthly(String(plan.monthlyAllowance));
  setEditMaximum(String(plan.maxPerRequest));
  setError("");
  setPlanMessage("");
}
async function updateCustomPlan(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const monthly = Number(editMonthly);
  const maximum = Number(editMaximum);

  if (
    !editingPlanId ||
    !editPlanName.trim() ||
    !Number.isSafeInteger(monthly) ||
    !Number.isSafeInteger(maximum) ||
    monthly <= 0 ||
    maximum <= 0
  ) {
    setError("Please enter valid plan details.");
    return;
  }

  setUpdatingPlan(true);
  setError("");

  try {
    await apiRequest(
      `/api/plans/${editingPlanId}`,
      apiKey,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: editPlanName.trim(),
          monthlyAllowance: monthly,
          maxPerRequest: maximum,
        }),
      }
    );

    await loadDashboard(apiKey);

    setPlanMessage("Custom plan updated successfully.");
    setEditingPlanId("");
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to update plan."
    );
  } finally {
    setUpdatingPlan(false);
  }
}


async function changeAccountPlan(
  event: FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  if (!apiKey || !selectedAccountPlanId) {
    setError("Please select an account subscription.");
    return;
  }

  // Only allow account-type plans.
  const selectedPlan = plans.find(
    (plan) =>
      plan.id === selectedAccountPlanId &&
      plan.type === "account"
  );

  if (!selectedPlan) {
    setError("Invalid account subscription.");
    return;
  }

  setSavingAccountPlan(true);
  setError("");
  setAccountPlanMessage("");

  try {
    await apiRequest("/api/accounts/me/plan", apiKey, {
      method: "PATCH",
      body: JSON.stringify({
        planId: selectedAccountPlanId,
      }),
    });

    // Reload actual data from PostgreSQL.
    await loadDashboard(apiKey);

    setAccountPlanMessage(
      "Account subscription updated successfully."
    );

    setSelectedAccountPlanId("");
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to update account subscription."
    );
  } finally {
    setSavingAccountPlan(false);
  }
}


async function submitConsumption(
  event: FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  const units = Number(consumeUnits);

  if (
    !apiKey ||
    !consumeUserId ||
    !consumeRequestId.trim() ||
    !Number.isSafeInteger(units) ||
    units <= 0
  ) {
    setError("Please enter valid consumption details.");
    return;
  }

  setSendingConsume(true);
  setError("");
  setConsumeResult(null);

  try {
    const result = await apiRequest<ConsumeResult>(
      "/api/consume",
      apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          requestId: consumeRequestId.trim(),
          userId: consumeUserId,
          units,
        }),
      }
    );

    // Display the actual decision from the Quota Engine.
    setConsumeResult(result);

    // Update displayed counters from PostgreSQL.
    await loadDashboard(apiKey);
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to process consumption."
    );
  } finally {
    setSendingConsume(false);
  }
}

  async function loadDashboard(key: string) {
    setLoading(true);
    setError("");

    try {
      const [accountResponse, usageResponse, usersResponse, plansResponse] =
        await Promise.all([
          apiRequest<{ account: Account }>("/api/accounts/me", key),
          apiRequest<Usage>("/api/usage", key),
          apiRequest<{ users: User[] }>("/api/users", key),
          apiRequest<{ plans: Plan[] }>("/api/plans", key),
        ]);

      setAccount(accountResponse.account);
      setUsage(usageResponse);
      setUsers(usersResponse.users ?? []);
      setPlans(plansResponse.plans ?? []);
      setApiKey(key);
      setConnected(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Connection failed"
      );
    } finally {
      setLoading(false);
    }
  }
async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

  if (!apiKey || !newExternalId.trim() || !newUserPlan) {
    setError("Please enter a user ID and select a plan.");
    return;
  }

  setSavingUser(true);
  setError("");
  setUserMessage("");

  try {
    await apiRequest("/api/users", apiKey, {
      method: "POST",
      body: JSON.stringify({
        externalId: newExternalId.trim(),
        planCode: newUserPlan,
      }),
    });

    await loadDashboard(apiKey);

    setUserMessage("User created successfully.");
    setNewExternalId("");
    setNewUserPlan("");
    setShowAddUser(false);
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to create user."
    );
  } finally {
    setSavingUser(false);
  }
}

async function changeUserPlan(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!apiKey || !changingUserId || !targetPlanId) {
    setError("Please select a user and a subscription plan.");
    return;
  }

  setSavingPlan(true);
  setError("");
  setUserMessage("");

  try {
    await apiRequest(
      `/api/users/${changingUserId}/plan`,
      apiKey,
      {
        method: "PATCH",
        body: JSON.stringify({
          planId: targetPlanId,
        }),
      }
    );

    await loadDashboard(apiKey);

    setUserMessage("User subscription updated successfully.");
    setChangingUserId("");
    setTargetPlanId("");
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to update subscription."
    );
  } finally {
    setSavingPlan(false);
  }
}
async function createCustomPlan(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const monthly = Number(monthlyAllowance);
  const maximum = Number(maxPerRequest);

  if (
    !planName.trim() ||
    !planCode.trim() ||
    !Number.isSafeInteger(monthly) ||
    !Number.isSafeInteger(maximum) ||
    monthly <= 0 ||
    maximum <= 0
  ) {
    setError("Please enter valid plan details and positive integer limits.");
    return;
  }

  setSavingCustomPlan(true);
  setError("");
  setPlanMessage("");

  try {
    await apiRequest("/api/plans", apiKey, {
      method: "POST",
      body: JSON.stringify({
        name: planName.trim(),
        code: planCode.trim(),
        type: planType,
        monthlyAllowance: monthly,
        maxPerRequest: maximum,
      }),
    });

    await loadDashboard(apiKey);

    setPlanMessage("Custom plan created successfully.");
    setShowCreatePlan(false);
    setPlanName("");
    setPlanCode("");
    setMonthlyAllowance("500");
    setMaxPerRequest("50");
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to create plan."
    );
  } finally {
    setSavingCustomPlan(false);
  }
}

  async function loadHistory(
  pageNumber: number = 1,
  selectedUserId: string = ""
) {
  if (!apiKey) return;

  setHistoryLoading(true);
  setError("");

  try {
    const params = new URLSearchParams({
      page: String(pageNumber),
      limit: "10",
    });

    if (selectedUserId) {
      params.set("userId", selectedUserId);
    }

    const result = await apiRequest<HistoryResponse>(
      `/api/history?${params.toString()}`,
      apiKey
    );

    setHistory(result.history);
    setHistoryPage(result.pagination.page);
    setHistoryHasMore(result.pagination.hasMore);
    setHistoryUserId(selectedUserId);
  } catch (caught) {
    setError(
      caught instanceof Error
        ? caught.message
        : "Failed to load request history."
    );
  } finally {
    setHistoryLoading(false);
  }
}

async function changePage(next: Page) {
  setPage(next);

  if (next === "history") {
    await loadHistory(1, "");
  }
}

  function logout() {
    setApiKey("");
    setKeyInput("");
    setConnected(false);
    setAccount(null);
    setUsage(null);
    setUsers([]);
    setPlans([]);
    setHistory([]);
    setError("");
    setPage("overview");
  }

  const usageByUser = new Map(
    (usage?.users ?? []).map((user) => [user.id, user])
  );

  const accountPlan = plans.find(
    (plan) => plan.code === usage?.account.planCode
  );

  const mergedUsers = users.map((user) => {
    const counter = usageByUser.get(user.id);

    return {
      ...user,
      planCode: counter?.planCode ?? user.planCode ?? "—",
      consumedUnits: counter?.consumedUnits ?? 0,
      monthlyAllowance: counter?.monthlyAllowance ?? 0,
      remainingUnits: counter?.remainingUnits ?? 0,
    };
  });

  if (!connected) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F8FC] px-5">
        <div className="w-full max-w-md rounded-3xl border border-[#E7EAF0] bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-xl bg-[#6673A8] p-3 text-white">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#29354B]">
                QuotaFlow
              </h1>
              <p className="text-sm text-[#8B95A5]">
                Account workspace
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-[#29354B]">
            Connect your account
          </h2>

          <p className="mt-2 text-sm leading-6 text-[#8791A0]">
            Enter your Account API Key to view your subscription,
            users and monthly quota.
          </p>

          <form
            className="mt-7 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void loadDashboard(keyInput.trim());
            }}
          >
            <label className="block text-sm font-medium text-[#465269]">
              Account API Key
            </label>

            <div className="flex items-center gap-3 rounded-xl border border-[#DFE3EB] px-4 py-3">
              <KeyRound size={18} className="text-[#8B95A5]" />
              <input
                type="password"
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
                placeholder="um_..."
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                required
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !keyInput.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6673A8] px-5 py-3 font-medium text-white hover:bg-[#566499] disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Open dashboard"}
              <ArrowRight size={18} />
            </button>
          </form>

          <p className="mt-6 text-xs leading-5 text-[#98A1AF]">
            Use an Account API Key, not the Admin Setup Key.
            The key is kept in this page's memory and cleared on logout.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#29354B] lg:flex">
      <aside className="border-b border-[#E7EAF0] bg-white p-5 lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-7">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#6673A8] p-2.5 text-white">
            <Activity size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">QuotaFlow</h1>
            <p className="text-xs text-[#9AA3B0]">Workspace manager</p>
          </div>
        </div>

        <p className="mt-10 mb-3 text-xs font-semibold tracking-widest text-[#A0A8B6]">
          WORKSPACE
        </p>

        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = page === item.id;

            return (
              <button
                key={item.id}
                onClick={() => void changePage(item.id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  selected
                    ? "bg-[#EEF0F9] text-[#5B689E]"
                    : "text-[#8791A0] hover:bg-[#F7F8FC]"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-10 rounded-2xl bg-[#F5F6FB] p-4">
          <Building2 size={19} className="text-[#6673A8]" />
          <p className="mt-3 font-semibold">
            {account?.name ?? "Account"}
          </p>
          <p className="mt-1 text-xs text-[#8B95A5]">
            {usage?.account.planCode ?? "Subscription"}
          </p>
        </div>

        <button
          onClick={logout}
          className="mt-6 flex items-center gap-2 text-sm text-[#8791A0] hover:text-rose-600"
        >
          <LogOut size={17} />
          Disconnect
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[#8B95A5]">
              Workspace / {page}
            </p>
            <h2 className="mt-2 text-2xl font-bold capitalize lg:text-3xl">
              {page === "overview" ? "Account overview" : page}
            </h2>
          </div>

          <button
            onClick={() => {
              if (page === "history") {
                void loadHistory(historyPage, historyUserId);
              } else {
                void loadDashboard(apiKey);
              }
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#E2E6ED] bg-white px-4 py-2.5 text-sm text-[#5B6680] disabled:opacity-50"
          >
            <RefreshCw size={16} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {page === "overview" && usage && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-[#EEF0F9] p-3 text-[#6673A8]">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <p className="text-xs text-[#929CAB]">
                      Account name
                    </p>
                    <h3 className="text-xl font-bold">
                      {account?.name ?? "Account"}
                    </h3>
                    <p className="mt-1 text-xs text-[#929CAB]">
                      {account?.id}
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-[#EEF0F9] px-4 py-2 text-xs font-medium text-[#6471A4]">
                  {accountPlan?.name ??
                    usage.account.planCode ??
                    "Current subscription"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 border-t border-[#EDF0F4] pt-5 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-[#8B95A5]">
                    Account subscription
                  </p>
                  <p className="mt-1 font-semibold">
                    {accountPlan?.name ??
                      usage.account.planCode ??
                      "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#8B95A5]">
                    Max units per request
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatNumber(
                      usage.account.maxPerRequest ?? 0
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Monthly allowance",
                  value: usage.account.monthlyAllowance,
                },
                {
                  label: "Consumed units",
                  value: usage.account.consumedUnits,
                },
                {
                  label: "Remaining quota",
                  value: usage.account.remainingUnits,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#E7EAF0] bg-white p-6"
                >
                  <p className="text-sm text-[#8791A0]">
                    {stat.label}
                  </p>
                  <p className="mt-4 text-3xl font-bold">
                    {formatNumber(stat.value)}
                  </p>
                  <p className="mt-2 text-xs text-[#A0A8B6]">
                    Current UTC month
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-semibold">Account quota</h3>
                <span className="text-sm text-[#8791A0]">
                  {formatNumber(usage.account.consumedUnits)} /{" "}
                  {formatNumber(usage.account.monthlyAllowance)}
                </span>
              </div>
              <ProgressBar
                used={usage.account.consumedUnits}
                total={usage.account.monthlyAllowance}
              />
              <p className="mt-3 text-xs text-[#929CAB]">
                Monthly usage is shared across all users.
              </p>
            </section>

            <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-semibold">
                  Users & subscriptions
                </h3>
                <button
                  onClick={() => void changePage("users")}
                  className="text-sm font-medium text-[#6673A8]"
                >
                  View all
                </button>
              </div>

              <UsersTable users={mergedUsers.slice(0, 5)} />
            </section>
          </div>
        )}

        
{page === "users" && (
  <div className="space-y-5">
    <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            Users ({mergedUsers.length})
          </h3>
          <p className="mt-1 text-sm text-[#929CAB]">
            Manage your users and their subscription plans.
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddUser(!showAddUser);
            setError("");
            setUserMessage("");
          }}
          className="rounded-xl bg-[#6673A8] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#566499]"
        >
          {showAddUser ? "Cancel" : "+ Add User"}
        </button>
      </div>

      {userMessage && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-[#F0F6F0] p-3 text-sm text-[#64876E]"
        >
          {userMessage}
        </p>
      )}

      {showAddUser && (
        <form
          onSubmit={createUser}
          className="mt-6 space-y-5 rounded-2xl border border-[#E7EAF0] bg-[#FAFBFD] p-5"
        >
          <h4 className="font-semibold">Create New User</h4>

          <div>
            <label
              htmlFor="external-id"
              className="mb-2 block text-sm font-medium"
            >
              External User ID
            </label>

            <input
              id="external-id"
              type="text"
              required
              value={newExternalId}
              onChange={(event) =>
                setNewExternalId(event.target.value)
              }
              placeholder="e.g. sara-001"
              className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
            />
          </div>

          <div>
            <label
              htmlFor="user-plan"
              className="mb-2 block text-sm font-medium"
            >
              Subscription Plan
            </label>

            <select
              id="user-plan"
              required
              value={newUserPlan}
              onChange={(event) =>
                setNewUserPlan(event.target.value)
              }
              className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
            >
              <option value="">Select a plan</option>

              {plans
                .filter((plan) => plan.type === "user")
                .map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.name} — {formatNumber(plan.monthlyAllowance)}
                    {" units/month"}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddUser(false)}
              className="rounded-xl border border-[#DFE3EB] bg-white px-5 py-2.5 text-sm"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={savingUser}
              className="rounded-xl bg-[#6673A8] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingUser ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      )}

      
<div className="mt-7">
  <UsersTable users={mergedUsers} />
</div>

<div className="mt-8 rounded-2xl border border-[#E7EAF0] bg-[#FAFBFD] p-5">
  <div className="mb-5">
    <h4 className="font-semibold text-[#29354B]">
      Change User Subscription
    </h4>
    <p className="mt-1 text-sm text-[#929CAB]">
      Assign a different plan to an existing user.
    </p>
  </div>

  <form
    onSubmit={changeUserPlan}
    className="grid gap-4 md:grid-cols-2"
  >
    <div>
      <label
        htmlFor="change-user"
        className="mb-2 block text-sm font-medium"
      >
        Select User
      </label>

      <select
        id="change-user"
        value={changingUserId}
        onChange={(event) => {
          setChangingUserId(event.target.value);
          setTargetPlanId("");
        }}
        required
        className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
      >
        <option value="">Choose a user</option>

        {mergedUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {user.externalId} — {user.planCode}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label
        htmlFor="target-plan"
        className="mb-2 block text-sm font-medium"
      >
        New Subscription
      </label>

      <select
        id="target-plan"
        value={targetPlanId}
        onChange={(event) =>
          setTargetPlanId(event.target.value)
        }
        required
        className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
      >
        <option value="">Choose a plan</option>

        {plans
          .filter((plan) => plan.type === "user")
          .map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {formatNumber(plan.monthlyAllowance)}
              {" units/month"}
            </option>
          ))}
      </select>
    </div>

    <div className="md:col-span-2 flex justify-end">
      <button
        type="submit"
        disabled={
          savingPlan ||
          !changingUserId ||
          !targetPlanId
        }
        className="rounded-xl bg-[#6673A8] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#566499] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {savingPlan ? "Updating..." : "Update Subscription"}
      </button>
    </div>
  </form>
</div>

    </section>
  </div>
)}


        
{page === "plans" && (
  <div className="space-y-6">
    <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#29354B]">
            Subscription Plans
          </h3>
          <p className="mt-1 text-sm text-[#929CAB]">
            Manage predefined and custom plans for your workspace.
          </p>
        </div>

        <button
          onClick={() => {
            setShowCreatePlan(!showCreatePlan);
            setPlanMessage("");
            setError("");
          }}
          className="rounded-xl bg-[#6673A8] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#566499]"
        >
          {showCreatePlan ? "Cancel" : "+ Create Plan"}
        </button>
      </div>

      {planMessage && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-[#F0F6F0] p-4 text-sm text-[#64876E]"
        >
          {planMessage}
        </p>
      )}

      {showCreatePlan && (
        <form
          onSubmit={createCustomPlan}
          className="mt-6 space-y-5 rounded-2xl border border-[#E7EAF0] bg-[#FAFBFD] p-5"
        >
          <h4 className="font-semibold text-[#29354B]">
            Create Custom Plan
          </h4>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="plan-name" className="mb-2 block text-sm">
                Plan Name
              </label>
              <input
                id="plan-name"
                required
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="e.g. Team Starter"
                className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
              />
            </div>

            <div>
              <label htmlFor="plan-code" className="mb-2 block text-sm">
                Plan Code
              </label>
              <input
                id="plan-code"
                required
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                placeholder="e.g. team-starter"
                className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
              />
            </div>

            <div>
              <label htmlFor="plan-type" className="mb-2 block text-sm">
                Plan Type
              </label>
              <select
                id="plan-type"
                value={planType}
                onChange={(e) =>
                  setPlanType(e.target.value as "user" | "account")
                }
                className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="user">User Plan</option>
                <option value="account">Account Plan</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="monthly-allowance"
                className="mb-2 block text-sm"
              >
                Monthly Allowance
              </label>
              <input
                id="monthly-allowance"
                type="number"
                min="1"
                step="1"
                required
                value={monthlyAllowance}
                onChange={(e) => setMonthlyAllowance(e.target.value)}
                className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none"
              />
            </div>

            <div>
              <label htmlFor="max-request" className="mb-2 block text-sm">
                Max Per Request
              </label>
              <input
                id="max-request"
                type="number"
                min="1"
                step="1"
                required
                value={maxPerRequest}
                onChange={(e) => setMaxPerRequest(e.target.value)}
                className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>

          <p className="text-xs leading-5 text-[#929CAB]">
            User plans limit individual users. Account plans limit
            the total consumption shared by all users.
          </p>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingCustomPlan}
              className="rounded-xl bg-[#6673A8] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingCustomPlan ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      )}
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="rounded-2xl border border-[#E7EAF0] bg-white p-6"
        >
          <div className="flex items-center justify-between">
            <CreditCard size={20} className="text-[#6673A8]" />

            <span className="rounded-full bg-[#F2F3F8] px-3 py-1 text-xs text-[#7D87A0]">
              {plan.type === "account" ? "Account" : "User"}
            </span>
          </div>

          <h3 className="mt-5 font-semibold text-[#29354B]">
            {plan.name}
          </h3>

          <p className="mt-1 text-xs text-[#9AA3B0]">
            {plan.code}
          </p>

          <p className="mt-5 text-2xl font-bold text-[#29354B]">
            {formatNumber(plan.monthlyAllowance)}
          </p>

          <p className="text-sm text-[#929CAB]">
            units per month
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-[#EDF0F4] pt-4">
            <span className="text-sm text-[#758093]">
              Max/request: {formatNumber(plan.maxPerRequest)}
            </span>

            <span className="text-xs text-[#929CAB]">
              {plan.isSystem ? "System" : "Custom"}
            </span>
          </div>

          {!plan.isSystem && (
            <button
              type="button"
              onClick={() => startEditingPlan(plan)}
              className="mt-4 w-full rounded-xl border border-[#DFE3EB] px-4 py-2.5 text-sm font-medium text-[#6673A8] hover:bg-[#F5F6FB]"
            >
              Edit Plan
            </button>
          )}
        </div>
      ))}
    </section>
    
{editingPlanId && (
  <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
    <div className="mb-5 flex items-center justify-between">
      <h3 className="text-lg font-semibold">
        Edit Custom Plan
      </h3>

      <button
        type="button"
        onClick={() => setEditingPlanId("")}
        className="text-sm text-[#8791A0]"
      >
        Cancel
      </button>
    </div>

    <form
      onSubmit={updateCustomPlan}
      className="grid gap-4 md:grid-cols-2"
    >
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm">
          Plan Name
        </label>
        <input
          required
          value={editPlanName}
          onChange={(e) => setEditPlanName(e.target.value)}
          className="w-full rounded-xl border border-[#DFE3EB] px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm">
          Monthly Allowance
        </label>
        <input
          type="number"
          min="1"
          step="1"
          required
          value={editMonthly}
          onChange={(e) => setEditMonthly(e.target.value)}
          className="w-full rounded-xl border border-[#DFE3EB] px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm">
          Max Per Request
        </label>
        <input
          type="number"
          min="1"
          step="1"
          required
          value={editMaximum}
          onChange={(e) => setEditMaximum(e.target.value)}
          className="w-full rounded-xl border border-[#DFE3EB] px-4 py-3 text-sm"
        />
      </div>

      <div className="flex justify-end md:col-span-2">
        <button
          type="submit"
          disabled={updatingPlan}
          className="rounded-xl bg-[#6673A8] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {updatingPlan ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  </section>

)}

<section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
  <div className="mb-6">
    <h3 className="text-lg font-semibold text-[#29354B]">
      Account Subscription
    </h3>

    <p className="mt-1 text-sm text-[#929CAB]">
      Manage the monthly quota shared by all users in your account.
    </p>
  </div>

  <div className="mb-6 rounded-xl bg-[#F5F6FB] p-5">
    <p className="text-xs text-[#929CAB]">
      Current Subscription
    </p>

    <p className="mt-2 text-lg font-semibold text-[#29354B]">
      {accountPlan?.name ??
        usage?.account.planCode ??
        "Unknown plan"}
    </p>

    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs text-[#929CAB]">
          Monthly Allowance
        </p>

        <p className="mt-1 font-semibold">
          {formatNumber(usage?.account.monthlyAllowance ?? 0)}
          {" units"}
        </p>
      </div>

      <div>
        <p className="text-xs text-[#929CAB]">
          Max Per Request
        </p>

        <p className="mt-1 font-semibold">
          {formatNumber(usage?.account.maxPerRequest ?? 0)}
          {" units"}
        </p>
      </div>
    </div>
  </div>

  {accountPlanMessage && (
    <p
      role="status"
      className="mb-5 rounded-xl bg-[#F0F6F0] p-4 text-sm text-[#64876E]"
    >
      {accountPlanMessage}
    </p>
  )}

  <form
    onSubmit={changeAccountPlan}
    className="space-y-4"
  >
    <div>
      <label
        htmlFor="account-plan"
        className="mb-2 block text-sm font-medium text-[#29354B]"
      >
        Change Account Subscription
      </label>

      <select
        id="account-plan"
        required
        value={selectedAccountPlanId}
        onChange={(event) => {
          setSelectedAccountPlanId(event.target.value);
          setAccountPlanMessage("");
        }}
        className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
      >
        <option value="">
          Select an account plan
        </option>

        {plans
          .filter((plan) => plan.type === "account")
          .map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} —{" "}
              {formatNumber(plan.monthlyAllowance)}
              {" units/month"}
            </option>
          ))}
      </select>
    </div>

    <p className="text-xs leading-5 text-[#929CAB]">
      Changing the account plan updates its quota limits.
      Previously consumed units will not be deleted.
    </p>

    <div className="flex justify-end">
      <button
        type="submit"
        disabled={
          savingAccountPlan ||
          !selectedAccountPlanId ||
          selectedAccountPlanId === accountPlan?.id
        }
        className="rounded-xl bg-[#6673A8] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#566499] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {savingAccountPlan
          ? "Updating..."
          : "Update Account Subscription"}
      </button>
    </div>
  </form>
</section>


  </div>
)}

{page === "playground" && (
  <div className="space-y-6">
    <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[#29354B]">
          API Playground
        </h3>
        <p className="mt-1 text-sm text-[#929CAB]">
          Test real consumption requests against your account quotas.
        </p>
      </div>

      <form onSubmit={submitConsumption} className="space-y-5">
        <div>
          <label
            htmlFor="consume-user"
            className="mb-2 block text-sm font-medium"
          >
            Select User
          </label>

          <select
            id="consume-user"
            required
            value={consumeUserId}
            onChange={(event) => {
              setConsumeUserId(event.target.value);
              setConsumeResult(null);
            }}
            className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm"
          >
            <option value="">Choose a user</option>
            {mergedUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.externalId} — {user.planCode}
                {" ("}
                {formatNumber(user.remainingUnits)}
                {" remaining)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="consume-units"
            className="mb-2 block text-sm font-medium"
          >
            Units to Consume
          </label>

          <input
            id="consume-units"
            type="number"
            min="1"
            step="1"
            required
            value={consumeUnits}
            onChange={(event) => {
              setConsumeUnits(event.target.value);
              setConsumeResult(null);
            }}
            className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="consume-request-id"
            className="mb-2 block text-sm font-medium"
          >
            Request ID
          </label>

          <input
            id="consume-request-id"
            type="text"
            required
            value={consumeRequestId}
            onChange={(event) => {
              setConsumeRequestId(event.target.value);
              setConsumeResult(null);
            }}
            className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm"
          />

          <p className="mt-2 text-xs text-[#929CAB]">
            Reuse the same Request ID to test idempotency.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setConsumeRequestId(crypto.randomUUID());
              setConsumeResult(null);
            }}
            className="rounded-xl border border-[#DFE3EB] bg-white px-5 py-3 text-sm"
          >
            Generate New Request ID
          </button>

          <button
            type="submit"
            disabled={sendingConsume || !consumeUserId}
            className="rounded-xl bg-[#6673A8] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {sendingConsume ? "Processing..." : "Send Consumption"}
          </button>
        </div>
      </form>
    </section>

    {consumeResult && (
      <section
        className={`rounded-2xl border p-6 ${
          consumeResult.status === "accepted"
            ? "border-[#D8E6D9] bg-[#F3F8F3]"
            : "border-[#EBDCDD] bg-[#FCF5F5]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">
            Consumption Result
          </h3>

          <span
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              consumeResult.status === "accepted"
                ? "bg-[#E0EEE2] text-[#547B60]"
                : "bg-[#F7E6E8] text-[#A56269]"
            }`}
          >
            {consumeResult.status.toUpperCase()}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-[#8791A0]">
              Request Type
            </p>
            <p className="mt-1 font-medium">
              {consumeResult.replayed
                ? "Idempotent Replay"
                : "New Request"}
            </p>
          </div>

          <div>
            <p className="text-sm text-[#8791A0]">
              Requested Units
            </p>
            <p className="mt-1 font-medium">
              {formatNumber(Number(consumeUnits))}
            </p>
          </div>

          {consumeResult.rejectionLevel && (
            <div>
              <p className="text-sm text-[#8791A0]">
                Rejection Level
              </p>
              <p className="mt-1 font-medium">
                {consumeResult.rejectionLevel}
              </p>
            </div>
          )}

          {consumeResult.rejectionRule && (
            <div>
              <p className="text-sm text-[#8791A0]">
                Rejection Rule
              </p>
              <p className="mt-1 font-medium">
                {consumeResult.rejectionRule}
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-sm text-[#758093]">
          View the Overview page to see updated account
          and user quota balances.
        </p>
      </section>
    )}
  </div>
)}


       
{page === "history" && (
  <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6">
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-[#29354B]">
        Request History
      </h3>
      <p className="mt-1 text-sm text-[#929CAB]">
        Review all consumption attempts and quota decisions.
      </p>
    </div>

    {/* User filter */}
    <div className="mb-6 max-w-sm">
      <label
        htmlFor="history-user-filter"
        className="mb-2 block text-sm font-medium"
      >
        Filter by User
      </label>

      <select
        id="history-user-filter"
        value={historyUserId}
        onChange={(event) => {
          void loadHistory(1, event.target.value);
        }}
        disabled={historyLoading}
        className="w-full rounded-xl border border-[#DFE3EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#6673A8]"
      >
        <option value="">All Users</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.externalId}
          </option>
        ))}
      </select>
    </div>

    {/* Request history table */}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-[#929CAB]">
          <tr>
            <th className="pb-4 font-medium">User</th>
            <th className="pb-4 font-medium">Request ID</th>
            <th className="pb-4 font-medium">Units</th>
            <th className="pb-4 font-medium">Status</th>
            <th className="pb-4 font-medium">Rejection Reason</th>
            <th className="pb-4 font-medium">Date & Time</th>
          </tr>
        </thead>

        <tbody>
          {history.map((record) => {
            const user = users.find(
              (item) => item.id === record.userId
            );

            return (
              <tr
                key={record.id}
                className="border-t border-[#EDF0F4]"
              >
                <td className="py-4 font-medium">
                  {user?.externalId ?? record.userId}
                </td>

                <td className="max-w-[180px] truncate py-4 text-[#6673A8]">
                  <span title={record.requestId}>
                    {record.requestId}
                  </span>
                </td>

                <td className="py-4">
                  {formatNumber(record.units)}
                </td>

                <td className="py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      record.status === "accepted"
                        ? "bg-[#E8F2E9] text-[#547B60]"
                        : "bg-[#F9E9EB] text-[#AC6D73]"
                    }`}
                  >
                    {record.status === "accepted"
                      ? "Accepted"
                      : "Rejected"}
                  </span>
                </td>

                <td className="py-4 text-[#758093]">
                  {record.rejectionRule
                    ? `${record.rejectionLevel ?? "quota"}: ${record.rejectionRule}`
                    : "—"}
                </td>

                <td className="py-4 text-[#758093]">
                  {new Date(record.processedAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {history.length === 0 && !historyLoading && (
        <p className="py-10 text-center text-sm text-[#929CAB]">
          No consumption requests found.
        </p>
      )}

      {historyLoading && (
        <p className="py-5 text-center text-sm text-[#929CAB]">
          Loading requests...
        </p>
      )}
    </div>

    {/* Pagination */}
    <div className="mt-6 flex items-center justify-between border-t border-[#EDF0F4] pt-5">
      <p className="text-sm text-[#929CAB]">
        Page {historyPage}
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={historyPage <= 1 || historyLoading}
          onClick={() =>
            void loadHistory(historyPage - 1, historyUserId)
          }
          className="rounded-xl border border-[#DFE3EB] px-4 py-2 text-sm disabled:opacity-40"
        >
          Previous
        </button>

        <button
          type="button"
          disabled={!historyHasMore || historyLoading}
          onClick={() =>
            void loadHistory(historyPage + 1, historyUserId)
          }
          className="rounded-xl bg-[#6673A8] px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  </section>
)}


        <footer className="mt-10 flex items-center gap-2 text-xs text-[#A0A8B6]">
          <ShieldCheck size={16} />
          QuotaFlow · Usage Metering Service
        </footer>
      </main>
    </div>
  );
}

function UsersTable({
  users,
}: {
  users: Array<{
    id: string;
    externalId: string;
    planCode: string;
    consumedUnits: number;
    monthlyAllowance: number;
    remainingUnits: number;
  }>;
}) {
  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[#929CAB]">
        No users have been created yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[580px] text-left text-sm">
        <thead className="text-[#929CAB]">
          <tr>
            <th className="pb-4 font-medium">User</th>
            <th className="pb-4 font-medium">Subscription</th>
            <th className="pb-4 font-medium">Usage</th>
            <th className="pb-4 font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-t border-[#EDF0F4]"
            >
              <td className="py-5 font-medium">
                {user.externalId}
              </td>
              <td className="py-5 text-[#6673A8]">
                {user.planCode}
              </td>
              <td className="w-48 py-5">
                <div className="mb-2 text-xs text-[#798497]">
                  {formatNumber(user.consumedUnits)} /{" "}
                  {formatNumber(user.monthlyAllowance)}
                </div>
                <ProgressBar
                  used={user.consumedUnits}
                  total={user.monthlyAllowance}
                />
              </td>
              <td className="py-5 font-medium text-[#64876E]">
                {formatNumber(user.remainingUnits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
