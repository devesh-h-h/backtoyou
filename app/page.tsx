"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
};

type Item = {
  id: number;
  item_name: string | null;
  description: string | null;
  location: string | null;
  user_email: string | null;
  created_at: string;
};

export default function Home() {
  // =========================
  // AUTH STATES
  // =========================

  const [isLogin, setIsLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // =========================
  // LOST ITEM STATES
  // =========================

  const [showLostForm, setShowLostForm] = useState(false);
  const [lostItemName, setLostItemName] = useState("");
  const [lostDescription, setLostDescription] = useState("");
  const [lostLocation, setLostLocation] = useState("");

  // =========================
  // FOUND ITEM STATES
  // =========================

  const [showFoundForm, setShowFoundForm] = useState(false);
  const [foundItemName, setFoundItemName] = useState("");
  const [foundDescription, setFoundDescription] = useState("");
  const [foundLocation, setFoundLocation] = useState("");

  // =========================
  // ADMIN STATES
  // =========================

  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [lostItems, setLostItems] = useState<Item[]>([]);
  const [foundItems, setFoundItems] = useState<Item[]>([]);

  const [loadingAdmin, setLoadingAdmin] = useState(false);

  // =========================
  // SIGN UP
  // =========================

  async function signUp() {
    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert(
        "Signup successful! Check your email if confirmation is enabled."
      );
    }
  }

  // =========================
  // LOGIN
  // =========================

  async function login() {
    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // Check profile role
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, role")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profile?.name) {
      setName(profile.name);
    }

    if (profile?.role === "admin") {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }

    alert("Login successful!");
    setLoggedIn(true);
  }

  // =========================
  // SAVE PROFILE
  // =========================

  async function saveProfile() {
    if (!name || !email) {
      alert("Please enter name and email.");
      return;
    }

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

  // =========================
  // REPORT LOST ITEM
  // =========================

  async function reportLostItem() {
    if (!lostItemName || !lostDescription || !lostLocation) {
      alert("Please fill all lost item fields.");
      return;
    }

    const { error } = await supabase.from("lost_items").insert([
      {
        item_name: lostItemName,
        description: lostDescription,
        location: lostLocation,
        user_email: email,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Lost item reported successfully!");

      setLostItemName("");
      setLostDescription("");
      setLostLocation("");

      setShowLostForm(false);
    }
  }

  // =========================
  // REPORT FOUND ITEM
  // =========================

  async function reportFoundItem() {
    if (!foundItemName || !foundDescription || !foundLocation) {
      alert("Please fill all found item fields.");
      return;
    }

    const { error } = await supabase.from("found_items").insert([
      {
        item_name: foundItemName,
        description: foundDescription,
        location: foundLocation,
        user_email: email,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Found item reported successfully!");

      setFoundItemName("");
      setFoundDescription("");
      setFoundLocation("");

      setShowFoundForm(false);
    }
  }

  // =========================
  // LOAD ADMIN DATA
  // =========================

  async function loadAdminDashboard() {
    if (!isAdmin) {
      alert("You are not authorized to access the admin dashboard.");
      return;
    }

    setLoadingAdmin(true);

    const [
      { data: profilesData, error: profilesError },
      { data: lostData, error: lostError },
      { data: foundData, error: foundError },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("lost_items")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("found_items")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    setLoadingAdmin(false);

    if (profilesError) {
      alert("Could not load users: " + profilesError.message);
    }

    if (lostError) {
      alert("Could not load lost items: " + lostError.message);
    }

    if (foundError) {
      alert("Could not load found items: " + foundError.message);
    }

    setProfiles(profilesData || []);
    setLostItems(lostData || []);
    setFoundItems(foundData || []);

    setShowAdminDashboard(true);
  }

  // =========================
  // DELETE LOST ITEM
  // =========================

  async function deleteLostItem(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this lost item?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("lost_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setLostItems((items) =>
      items.filter((item) => item.id !== id)
    );

    alert("Lost item deleted.");
  }

  // =========================
  // DELETE FOUND ITEM
  // =========================

  async function deleteFoundItem(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this found item?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("found_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setFoundItems((items) =>
      items.filter((item) => item.id !== id)
    );

    alert("Found item deleted.");
  }

  // =========================
  // LOGOUT
  // =========================

  async function logout() {
    await supabase.auth.signOut();

    setLoggedIn(false);
    setIsAdmin(false);
    setShowAdminDashboard(false);

    setEmail("");
    setPassword("");
    setName("");
  }

  // =========================
  // ADMIN DASHBOARD
  // =========================

  if (loggedIn && showAdminDashboard && isAdmin) {
    return (
      <div style={{ padding: 40 }}>
        <h1>🔧 BackToYou Admin Dashboard</h1>

        <p>
          Welcome, <strong>{name || "Admin"}</strong> 👋
        </p>

        <br />

        <button onClick={() => setShowAdminDashboard(false)}>
          ← Back to Home
        </button>

        <button
          onClick={loadAdminDashboard}
          style={{ marginLeft: 10 }}
        >
          🔄 Refresh
        </button>

        <hr style={{ margin: "30px 0" }} />

        {loadingAdmin ? (
          <h3>Loading admin data...</h3>
        ) : (
          <>
            {/* USERS */}

            <h2>👥 Registered Users</h2>

            <p>
              Total Users: <strong>{profiles.length}</strong>
            </p>

            {profiles.length === 0 ? (
              <p>No users found.</p>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: 15,
                    marginBottom: 10,
                  }}
                >
                  <strong>{profile.name || "No name"}</strong>

                  <br />

                  📧 {profile.email || "No email"}

                  <br />

                  🔐 Role: {profile.role || "user"}
                </div>
              ))
            )}

            <hr style={{ margin: "30px 0" }} />

            {/* LOST ITEMS */}

            <h2>📦 Lost Item Reports</h2>

            <p>
              Total Lost Reports:{" "}
              <strong>{lostItems.length}</strong>
            </p>

            {lostItems.length === 0 ? (
              <p>No lost item reports.</p>
            ) : (
              lostItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: 15,
                    marginBottom: 10,
                  }}
                >
                  <h3>{item.item_name}</h3>

                  <p>
                    <strong>Description:</strong>{" "}
                    {item.description}
                  </p>

                  <p>
                    <strong>Location:</strong>{" "}
                    {item.location}
                  </p>

                  <p>
                    <strong>Reported by:</strong>{" "}
                    {item.user_email}
                  </p>

                  <button
                    onClick={() =>
                      deleteLostItem(item.id)
                    }
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))
            )}

            <hr style={{ margin: "30px 0" }} />

            {/* FOUND ITEMS */}

            <h2>🎁 Found Item Reports</h2>

            <p>
              Total Found Reports:{" "}
              <strong>{foundItems.length}</strong>
            </p>

            {foundItems.length === 0 ? (
              <p>No found item reports.</p>
            ) : (
              foundItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    padding: 15,
                    marginBottom: 10,
                  }}
                >
                  <h3>{item.item_name}</h3>

                  <p>
                    <strong>Description:</strong>{" "}
                    {item.description}
                  </p>

                  <p>
                    <strong>Location:</strong>{" "}
                    {item.location}
                  </p>

                  <p>
                    <strong>Reported by:</strong>{" "}
                    {item.user_email}
                  </p>

                  <button
                    onClick={() =>
                      deleteFoundItem(item.id)
                    }
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))
            )}
          </>
        )}

        <br />
        <br />

        <button onClick={logout}>
          🚪 Logout
        </button>
      </div>
    );
  }

  // =========================
  // LOGGED-IN HOME
  // =========================

  if (loggedIn) {
    return (
      <div style={{ padding: 40 }}>
        <h1>🎒 BackToYou</h1>

        <h2>
          Welcome, {name || "User"} 👋
        </h2>

        <br />

        {/* ADMIN BUTTON */}

        {isAdmin && (
          <>
            <button onClick={loadAdminDashboard}>
              🔧 Admin Dashboard
            </button>

            <br />
            <br />
          </>
        )}

        {/* LOST ITEM */}

        <button
          onClick={() => {
            setShowLostForm(!showLostForm);
            setShowFoundForm(false);
          }}
        >
          📦 Report Lost Item
        </button>

        {showLostForm && (
          <div
            style={{
              marginTop: 20,
              padding: 20,
              border: "1px solid gray",
              borderRadius: 10,
              maxWidth: 500,
            }}
          >
            <h3>📦 Report Lost Item</h3>

            <input
              type="text"
              placeholder="Item Name"
              value={lostItemName}
              onChange={(e) =>
                setLostItemName(e.target.value)
              }
            />

            <br />
            <br />

            <textarea
              placeholder="Description"
              value={lostDescription}
              onChange={(e) =>
                setLostDescription(e.target.value)
              }
            />

            <br />
            <br />

            <input
              type="text"
              placeholder="Location Lost"
              value={lostLocation}
              onChange={(e) =>
                setLostLocation(e.target.value)
              }
            />

            <br />
            <br />

            <button onClick={reportLostItem}>
              Submit Lost Report
            </button>

            <button
              onClick={() => setShowLostForm(false)}
              style={{ marginLeft: 10 }}
            >
              Cancel
            </button>
          </div>
        )}

        <br />
        <br />

        {/* FOUND ITEM */}

        <button
          onClick={() => {
            setShowFoundForm(!showFoundForm);
            setShowLostForm(false);
          }}
        >
          🎁 Report Found Item
        </button>

        {showFoundForm && (
          <div
            style={{
              marginTop: 20,
              padding: 20,
              border: "1px solid gray",
              borderRadius: 10,
              maxWidth: 500,
            }}
          >
            <h3>🎁 Report Found Item</h3>

            <input
              type="text"
              placeholder="Item Name"
              value={foundItemName}
              onChange={(e) =>
                setFoundItemName(e.target.value)
              }
            />

            <br />
            <br />

            <textarea
              placeholder="Description"
              value={foundDescription}
              onChange={(e) =>
                setFoundDescription(e.target.value)
              }
            />

            <br />
            <br />

            <input
              type="text"
              placeholder="Location Found"
              value={foundLocation}
              onChange={(e) =>
                setFoundLocation(e.target.value)
              }
            />

            <br />
            <br />

            <button onClick={reportFoundItem}>
              Submit Found Report
            </button>

            <button
              onClick={() => setShowFoundForm(false)}
              style={{ marginLeft: 10 }}
            >
              Cancel
            </button>
          </div>
        )}

        <br />
        <br />

        {/* OTHER FEATURES */}

        <button>
          🔍 Browse Items
        </button>

        <br />
        <br />

        <button>
          👤 My Reports
        </button>

        <br />
        <br />

        {/* LOGOUT */}

        <button onClick={logout}>
          🚪 Logout
        </button>
      </div>
    );
  }

  // =========================
  // LOGIN / SIGNUP PAGE
  // =========================

  return (
    <div style={{ padding: 40 }}>
      <h1>🎒 BackToYou</h1>

      <h2>
        {isLogin ? "Login" : "Create Account"}
      </h2>

      {!isLogin && (
        <>
          <input
            type="text"
            placeholder="Enter Name"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
          />

          <br />
          <br />
        </>
      )}

      <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
      />

      <br />
      <br />

      <input
        type="password"
        placeholder="Enter Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
      />

      <br />
      <br />

      {isLogin ? (
        <button onClick={login}>
          Login
        </button>
      ) : (
        <button onClick={signUp}>
          Sign Up
        </button>
      )}

      <br />
      <br />

      <button
        onClick={() => {
          setIsLogin(!isLogin);
          setPassword("");
        }}
      >
        {isLogin
          ? "Create New Account"
          : "Already have an account? Login"}
      </button>

      {!isLogin && (
        <>
          <br />
          <br />

          <button onClick={saveProfile}>
            Save Profile
          </button>
        </>
      )}
    </div>
  );
}