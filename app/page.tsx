"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function saveData() {
    const { error } = await supabase.from("profiles").insert([
      {
        name,
        email,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Data saved successfully!");
      setName("");
      setEmail("");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>BackToYou</h1>

      <input
        type="text"
        placeholder="Enter Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <br />
      <br />

      <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />
      <br />

      <button onClick={saveData}>Save</button>
    </div>
  );
}