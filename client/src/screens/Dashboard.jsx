import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { DataTable } from "../components/ui.jsx";

export default function Dashboard({ data }) {
  const summary = data.dashboard || {};
  const circulation = summary.circulation ?? (data.students || []).reduce((sum, student) => sum + student.currentJCoins, 0);
  const produced = summary.produced ?? (data.transactions || []).reduce((sum, transaction) => sum + Math.max(0, Number(transaction.amount || 0)), 0);
  const removed = summary.removed ?? (data.transactions || []).reduce((sum, transaction) => sum + Math.abs(Math.min(0, Number(transaction.amount || 0))), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaysTransactions = (data.transactions || []).filter((transaction) => String(transaction.createdAt || "").startsWith(today));
  const todaysRecitations = (data.recitations || []).filter((recitation) => recitation.date === today);
  const pendingRequests = (data.requests || []).filter((request) => request.status === "pending");
  const submittedActivityCount = (data.activities || []).reduce((sum, activity) => {
    if (Number.isFinite(Number(activity.submittedCount))) return sum + Number(activity.submittedCount);
    return sum + (activity.rows || []).filter((row) => row.submitted).length;
  }, 0);
  const totalActivityRows = (data.activities || []).reduce((sum, activity) => {
    if (Number.isFinite(Number(activity.totalRows))) return sum + Number(activity.totalRows);
    return sum + (activity.rows?.length || 0);
  }, 0);
  const submittedPercent = summary.submittedPercent ?? (totalActivityRows ? Math.round((submittedActivityCount / totalActivityRows) * 100) : 0);
  const roleLabel = data.user?.role === "teacher" ? "My Students" : "All Students";
  const jcoinDaily = summary.jcoinDaily || dailyJCoins(data.transactions || []);
  const recitationDaily = summary.recitationDaily || dailyCounts(data.recitations || [], (recitation) => recitation.date, "recitations");
  const transactionDaily = summary.transactionDaily || dailyCounts(data.transactions || [], (transaction) => String(transaction.createdAt || "").slice(0, 10), "transactions");
  const attendanceDaily = summary.attendanceDaily || dailyAttendance(data.attendanceRecords || []);
  const topThree = summary.topThree || [...(data.students || [])].sort((a, b) => b.currentJCoins - a.currentJCoins).slice(0, 3);
  const activityMonitor = summary.activityMonitor || (data.activities || []).slice(0, 8);
  const recentTransactions = summary.recentTransactions || (data.transactions || []).slice(0, 10);
  const recentRecitations = summary.recentRecitations || (data.recitations || []).slice(0, 10);
  const dashboardPendingRequests = summary.pendingRequests || pendingRequests.slice(0, 10);
  const metrics = [
    { label: roleLabel, value: data.students.length },
    { label: "Subjects", value: (data.user?.role === "teacher" ? data.user.subjectIds || [] : data.subjects || []).length },
    { label: "Sections", value: (data.sections || []).length },
    { label: "Activities", value: (data.activities || []).length },
    { label: "Submitted", value: `${submittedPercent}%` },
    { label: "Recitations Today", value: summary.todaysRecitationsCount ?? todaysRecitations.length },
    { label: "Transactions Today", value: summary.todaysTransactionsCount ?? todaysTransactions.length },
    { label: "Attendance Weeks", value: summary.attendanceWeeksCount ?? (data.attendanceWeeks || []).length },
    { label: "Pending Requests", value: summary.pendingRequestsCount ?? pendingRequests.length },
    { label: "Shop Items", value: summary.shopItemsCount ?? (data.shopItems || []).length }
  ];

  return <div className="dashboard-grid">
    <DashboardEconomy circulation={circulation} produced={produced} removed={removed} />
    <MetricStrip metrics={metrics} />

    <TopThree students={topThree} />

    <ChartPanel title="Daily JCoins Given vs Removed" wide>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={jcoinDaily}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
          <XAxis dataKey="date" stroke="#a7b3c8" />
          <YAxis stroke="#a7b3c8" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Line type="monotone" dataKey="given" name="Given" stroke="#34d399" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="removed" name="Removed" stroke="#fb7185" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
    <ChartPanel title="Recitations Per Day">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={recitationDaily}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
          <XAxis dataKey="date" stroke="#a7b3c8" />
          <YAxis allowDecimals={false} stroke="#a7b3c8" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="recitations" fill="#22d3ee" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
    <ChartPanel title="Transactions Per Day">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={transactionDaily}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
          <XAxis dataKey="date" stroke="#a7b3c8" />
          <YAxis allowDecimals={false} stroke="#a7b3c8" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="transactions" fill="#a78bfa" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
    <ChartPanel title="Attendance Activity Per Day" wide>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={attendanceDaily}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
          <XAxis dataKey="date" stroke="#a7b3c8" />
          <YAxis allowDecimals={false} stroke="#a7b3c8" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar dataKey="onTime" name="On Time" fill="#34d399" radius={[6, 6, 0, 0]} />
          <Bar dataKey="late" name="Late" fill="#facc15" radius={[6, 6, 0, 0]} />
          <Bar dataKey="excused" name="Excused" fill="#38bdf8" radius={[6, 6, 0, 0]} />
          <Bar dataKey="absent" name="Absent" fill="#fb7185" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>

    <DataTable title="Activity Monitor" defaultOpen columns={["Activity", "Subject", "Tracker", "Deadline", "Type"]} rows={activityMonitor.map((activity) => [activity.title, activity.subjectName, activity.tracker, activity.deadline, activity.type])} />
    <DataTable title="Recent Transactions" defaultOpen columns={["Date", "Student", "Type", "Amount", "Remarks"]} rows={recentTransactions.map((transaction) => [new Date(transaction.createdAt).toLocaleString(), transaction.studentName, transaction.type, transaction.amount, transaction.note])} />
    <DataTable title="Recent Recitations" columns={["Date", "Student", "Subject", "Amount", "Remarks"]} rows={recentRecitations.map((recitation) => [recitation.date, recitation.studentName, recitation.subjectName, recitation.amount, recitation.remarks])} />
    <DataTable title="Pending Requests" columns={["Date", "Type", "Student", "Remarks"]} rows={dashboardPendingRequests.map((request) => [new Date(request.createdAt).toLocaleString(), request.type, request.studentId || "-", request.remarks])} />
  </div>;
}

function DashboardEconomy({ circulation, produced, removed }) {
  return <section className="dashboard-economy wide">
    <div>
      <span className="eyebrow">JCoins Economy</span>
      <h2>{circulation.toLocaleString()}</h2>
      <p>JCoins currently in circulation after spending, penalties, and removals.</p>
    </div>
    <div className="economy-side">
      <article>
        <span>Produced</span>
        <strong>{produced.toLocaleString()}</strong>
      </article>
      <article>
        <span>Removed</span>
        <strong className="danger-text">{removed.toLocaleString()}</strong>
      </article>
    </div>
  </section>;
}

function MetricStrip({ metrics }) {
  return <section className="metric-strip wide">
    {metrics.map((metric) => <article key={metric.label} className="metric-tile">
      <span>{metric.label}</span>
      <strong>{formatMetric(metric.value)}</strong>
    </article>)}
  </section>;
}

function formatMetric(value) {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function TopThree({ students }) {
  return <section className="panel wide">
    <div className="section-title">Top 3 Earners</div>
    <div className="dashboard-top-three">
      {students.map((student, index) => <article className={`dashboard-top-card top-${index + 1}`} key={student.id}>
        <div className="medal">#{index + 1}</div>
        <div>
          <h3>{student.name}</h3>
          <strong>{student.currentJCoins.toLocaleString()} JCoins</strong>
          <span>{student.rank}</span>
        </div>
      </article>)}
    </div>
  </section>;
}

const tooltipStyle = {
  background: "#172033",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 8,
  color: "#f8fafc"
};

function ChartPanel({ title, children, wide = false }) {
  return <section className={`panel chart-panel ${wide ? "wide" : ""}`}>
    <div className="section-title">{title}</div>
    <div className="chart-body">{children}</div>
  </section>;
}

function lastNDays(days = 14) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function dailyJCoins(transactions) {
  const map = Object.fromEntries(lastNDays().map((date) => [date, { date, given: 0, removed: 0 }]));
  transactions.forEach((transaction) => {
    const date = String(transaction.createdAt || "").slice(0, 10);
    if (!map[date]) return;
    const amount = Number(transaction.amount || 0);
    if (amount >= 0) map[date].given += amount;
    else map[date].removed += Math.abs(amount);
  });
  return Object.values(map);
}

function dailyCounts(items, dateOf, key) {
  const map = Object.fromEntries(lastNDays().map((date) => [date, { date, [key]: 0 }]));
  items.forEach((item) => {
    const date = dateOf(item);
    if (map[date]) map[date][key] += 1;
  });
  return Object.values(map);
}

function dailyAttendance(records) {
  const map = Object.fromEntries(lastNDays().map((date) => [date, { date, onTime: 0, late: 0, excused: 0, absent: 0 }]));
  records.forEach((record) => {
    if (!map[record.date]) return;
    if (record.status === "check") map[record.date].onTime += 1;
    else if (record.status === "late") map[record.date].late += 1;
    else if (record.status === "excused") map[record.date].excused += 1;
    else map[record.date].absent += 1;
  });
  return Object.values(map);
}
