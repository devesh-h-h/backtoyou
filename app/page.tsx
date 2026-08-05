"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [isLogin, setIsLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Lost Item States
  const [showLostForm, setShowLostForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Signup successful! Check your email if confirmation is enabled.");
    }
  }

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Login successful!");
      setLoggedIn(true);
    }
  }

  async function saveProfile() {
    const { error } = await supabase.from("profiles").insert([
      {
        name,
        email,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Profile saved!");
    }
  }

  async function reportLostItem() {
    const { error } = await supabase.from("lost_items").insert([
      {
        item_name: itemName,
        description: description,
        location: location,
        user_email: email,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Lost item reported successfully!");

      setItemName("");
      setDescription("");
      setLocation("");

      setShowLostForm(false);
    }
  }

  if (loggedIn) {
    return (
      <div style={{ padding: 40 }}>
        <h1>🎒 BackToYou</h1>

        <h2>Welcome, {name || "User"} 👋</h2>

        <br />

        <button onClick={() => setShowLostForm(true)}>
          📦 Report Lost Item
        </button>

        {showLostForm && (
          <div
            style={{
              marginTop: 20,
              padding: 20,
              border: "1px solid gray",
              borderRadius: 10,
            }}
          >
            <h3>Report Lost Item</h3>

            <input
              type="text"
              placeholder="Item Name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />

            <br />
            <br />

            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <br />
            <br />

            <input
              type="text"
              placeholder="Location Lost"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <br />
            <br />

            <button onClick={reportLostItem}>
              Submit Report
            </button>
          </div>
        )}

        <br />
        <br />

        <button>🎁 Report Found Item</button>

        <br />
        <br />

        <button>🔍 Browse Items</button>

        <br />
        <br />

        <button>👤 My Reports</button>

        <br />
        <br />

        <button onClick={() => setLoggedIn(false)}>
          🚪 Logout
        </button>
      </div>
    );
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

      <input
        type="password"
        placeholder="Enter Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />
      <br />

      {isLogin ? (
        <button onClick={login}>Login</button>
      ) : (
        <button onClick={signUp}>Sign Up</button>
      )}

      <br />
      <br />

      <button onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "Create New Account" : "Already have an account? Login"}
      </button>

      <br />
      <br />

      <button onClick={saveProfile}>Save Profile</button>
    </div>
  );
}