import React, { useState } from "react";
import { del, post, put } from "../api.js";
import { ActionModal, Field, Panel, Table } from "../components/ui.jsx";

export default function Subjects({ data, run }) {
  const [name, setName] = useState("");
  const [edits, setEdits] = useState({});
  return <div className="dashboard-grid">
    <ActionModal title="Add Subject">
      <form onSubmit={(e) => { e.preventDefault(); run(() => post("/admin/subjects", { name }), "Subject added"); setName(""); }}>
        <Field label="Subject Name" value={name} onChange={setName} />
        <button>Add Subject</button>
      </form>
    </ActionModal>
    <Panel title="Subjects Table" wide defaultOpen={false}>
      <Table columns={["Subject", "Action"]} rows={data.subjects.map((s) => {
        const edit = edits[s.id] ?? s.name;
        return [
          <input value={edit} onChange={(e) => setEdits({ ...edits, [s.id]: e.target.value })} />,
          <div className="inline">
            <button onClick={() => run(() => put(`/admin/subjects/${s.id}`, { name: edit }), "Subject saved")}>Save</button>
            <button className="danger" onClick={() => confirm(`Delete ${s.name}? This removes its attendance, recitations, activities, and related JCoins.`) && run(() => del(`/admin/subjects/${s.id}`), "Subject deleted")}>Delete</button>
          </div>
        ];
      })} />
    </Panel>
  </div>;
}
