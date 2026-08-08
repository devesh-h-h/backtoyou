"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = {
  id: number;
  item_name: string;
  description: string;
  location: string;
  user_email: string;
  created_at?: string;
};

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function Home() {
  // =========================
  // AUTH / USER STATES
  // =========================

  const [isLogin, setIsLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [role, setRole] = useState("user");

  // =========================
  // LOST ITEM STATES
  // =========================

  const [showLostForm, setShowLostForm] = useState(false);

  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  // =========================
  // FOUND ITEM STATES
  // =========================

  const [showFoundForm, setShowFoundForm] = useState(false);

  const [foundItemName, setFoundItemName] = useState("");
  const [foundDescription, setFoundDescription] = useState("");
  const [foundLocation, setFoundLocation] = useState("");

  // =========================
  // BROWSE ITEMS STATES
  // =========================

  const [showBrowse, setShowBrowse] = useState(false);

  const [lostItems, setLostItems] = useState<Item[]>([]);
  const [foundItems, setFoundItems] = useState<Item[]>([]);

  const [browseLoading, setBrowseLoading] = useState(false);

  // =========================
  // MY REPORTS STATES
  // =========================

  const [showMyReports, setShowMyReports] = useState(false);

  // =========================
  // ADMIN STATES
  // =========================

  const [showAdmin, setShowAdmin] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminLostItems, setAdminLostItems] = useState<Item[]>([]);
  const [adminFoundItems, setAdminFoundItems] = useState<Item[]>([]);

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

    // Get profile information
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, email, role")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.log(profileError);
    }

    if (profile) {
      setName(profile.name || "User");
      setRole(profile.role || "user");
    } else {
      setName("User");
      setRole("user");
    }

    setLoggedIn(true);

    alert("Login successful!");
  }

  // =========================
  // SAVE PROFILE
  // =========================

  async function saveProfile() {
    if (!name || !email) {
      alert("Please enter your name and email.");
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
    if (!itemName || !description || !location) {
      alert("Please fill all fields.");
      return;
    }

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

  // =========================
  // REPORT FOUND ITEM
  // =========================

  async function reportFoundItem() {
    if (!foundItemName || !foundDescription || !foundLocation) {
      alert("Please fill all fields.");
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
  // BROWSE ITEMS
  // =========================

  async function loadBrowseItems() {
    setBrowseLoading(true);

    const { data: lostData, error: lostError } = await supabase
      .from("lost_items")
      .select("*")
      .order("id", { ascending: false });

    const { data: foundData, error: foundError } = await supabase
      .from("found_items")
      .select("*")
      .order("id", { ascending: false });

    if (lostError) {
      console.log("Lost items error:", lostError);
    }

    if (foundError) {
      console.log("Found items error:", foundError);
    }

    setLostItems(lostData || []);
    setFoundItems(foundData || []);

    setBrowseLoading(false);
  }

  function openBrowse() {
    setShowBrowse(true);
    setShowMyReports(false);
    setShowAdmin(false);

    loadBrowseItems();
  }

  // =========================
  // MY REPORTS
  // =========================

  async function loadMyReports() {
    const { data: lostData, error: lostError } = await supabase
      .from("lost_items")
      .select("*")
      .eq("user_email", email)
      .order("id", { ascending: false });

    const { data: foundData, error: foundError } = await supabase
      .from("found_items")
      .select("*")
      .eq("user_email", email)
      .order("id", { ascending: false });

    if (lostError) {
      console.log(lostError);
    }

    if (foundError) {
      console.log(foundError);
    }

    setLostItems(lostData || []);
    setFoundItems(foundData || []);
  }

  function openMyReports() {
    setShowMyReports(true);
    setShowBrowse(false);
    setShowAdmin(false);

    loadMyReports();
  }

  // =========================
  // ADMIN DASHBOARD
  // =========================

  async function loadAdminData() {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: lostData, error: lostError } = await supabase
      .from("lost_items")
      .select("*")
      .order("id", { ascending: false });

    const { data: foundData, error: foundError } = await supabase
      .from("found_items")
      .select("*")
      .order("id", { ascending: false });

    if (profileError) {
      console.log(profileError);
    }

    if (lostError) {
      console.log(lostError);
    }

    if (foundError) {
      console.log(foundError);
    }

    setProfiles(profileData || []);
    setAdminLostItems(lostData || []);
    setAdminFoundItems(foundData || []);
  }

  function openAdminDashboard() {
    setShowAdmin(true);
    setShowBrowse(false);
    setShowMyReports(false);

    loadAdminData();
  }

  // =========================
  // DELETE LOST ITEM
  // =========================

  async function deleteLostItem(id: number) {
    const confirmed = confirm(
      "Are you sure you want to delete this lost item?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("lost_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
    } else {
      alert("Lost item deleted.");

      setAdminLostItems((items) =>
        items.filter((item) => item.id !== id)
      );

      setLostItems((items) =>
        items.filter((item) => item.id !== id)
      );
    }
  }

  // =========================
  // DELETE FOUND ITEM
  // =========================

  async function deleteFoundItem(id: number) {
    const confirmed = confirm(
      "Are you sure you want to delete this found item?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("found_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
    } else {
      alert("Found item deleted.");

      setAdminFoundItems((items) =>
        items.filter((item) => item.id !== id)
      );

      setFoundItems((items) =>
        items.filter((item) => item.id !== id)
      );
    }
  }

  // =========================
  // LOGOUT
  // =========================

  async function logout() {
    await supabase.auth.signOut();

    setLoggedIn(false);
    setName("");
    setEmail("");
    setPassword("");
    setRole("user");

    setShowBrowse(false);
    setShowMyReports(false);
    setShowAdmin(false);
  }

  // =========================
  // CHECK EXISTING SESSION
  // =========================

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) {
        const userEmail = session.user.email;

        setEmail(userEmail);

        const { data: profile } = await supabase
          .from("profiles")
          .select("name, email, role")
          .eq("email", userEmail)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (profile) {
          setName(profile.name || "User");
          setRole(profile.role || "user");
        }

        setLoggedIn(true);
      }
    }

    checkSession();
  }, []);

  // =========================
  // LOGGED IN SCREEN
  // =========================

  if (loggedIn) {
    return (
      <div
        style={{
          padding: 40,
          maxWidth: 1000,
          margin: "0 auto",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1>🎒 BackToYou</h1>

        <h2>Welcome, {name || "User"} 👋</h2>

        <br />

        {/* ADMIN DASHBOARD */}

        {role === "admin" && (
          <>
            <button
              onClick={openAdminDashboard}
              style={{
                display: "block",
                marginBottom: 20,
                fontSize: 18,
                padding: 10,
              }}
            >
              🛠️ Admin Dashboard
            </button>
          </>
        )}

        {/* LOST ITEM */}

        <button
          onClick={() => {
            setShowLostForm(!showLostForm);
            setShowFoundForm(false);
            setShowBrowse(false);
            setShowMyReports(false);
            setShowAdmin(false);
          }}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          📦 Report Lost Item
        </button>

        {showLostForm && (
          <div
            style={{
              marginBottom: 30,
              padding: 20,
              border: "1px solid gray",
              borderRadius: 10,
            }}
          >
            <h3>📦 Report Lost Item</h3>

            <input
              type="text"
              placeholder="Item Name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
                minHeight: 100,
              }}
            />

            <input
              type="text"
              placeholder="Location Lost"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <button onClick={reportLostItem}>
              Submit Lost Item Report
            </button>
          </div>
        )}

        {/* FOUND ITEM */}

        <button
          onClick={() => {
            setShowFoundForm(!showFoundForm);
            setShowLostForm(false);
            setShowBrowse(false);
            setShowMyReports(false);
            setShowAdmin(false);
          }}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          🎁 Report Found Item
        </button>

        {showFoundForm && (
          <div
            style={{
              marginBottom: 30,
              padding: 20,
              border: "1px solid gray",
              borderRadius: 10,
            }}
          >
            <h3>🎁 Report Found Item</h3>

            <input
              type="text"
              placeholder="Item Name"
              value={foundItemName}
              onChange={(e) => setFoundItemName(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <textarea
              placeholder="Description"
              value={foundDescription}
              onChange={(e) => setFoundDescription(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
                minHeight: 100,
              }}
            />

            <input
              type="text"
              placeholder="Location Found"
              value={foundLocation}
              onChange={(e) => setFoundLocation(e.target.value)}
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <button onClick={reportFoundItem}>
              Submit Found Item Report
            </button>
          </div>
        )}

        {/* BROWSE ITEMS */}

        <button
          onClick={openBrowse}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          🔍 Browse Items
        </button>

        {showBrowse && (
          <div style={{ marginTop: 20, marginBottom: 40 }}>
            <h2>🔍 Browse Items</h2>

            {browseLoading ? (
              <p>Loading items...</p>
            ) : (
              <>
                <h3>📦 Lost Items</h3>

                {lostItems.length === 0 ? (
                  <p>No lost items reported yet.</p>
                ) : (
                  lostItems.map((item) => (
                    <div
                      key={`lost-${item.id}`}
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      <h3>📦 {item.item_name}</h3>

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

                      <strong>STATUS: LOST</strong>
                    </div>
                  ))
                )}

                <br />

                <h3>🎁 Found Items</h3>

                {foundItems.length === 0 ? (
                  <p>No found items reported yet.</p>
                ) : (
                  foundItems.map((item) => (
                    <div
                      key={`found-${item.id}`}
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      <h3>🎁 {item.item_name}</h3>

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

                      <strong>STATUS: FOUND</strong>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* MY REPORTS */}

        <button
          onClick={openMyReports}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          👤 My Reports
        </button>

        {showMyReports && (
          <div style={{ marginBottom: 40 }}>
            <h2>👤 My Reports</h2>

            <h3>📦 My Lost Reports</h3>

            {lostItems.length === 0 ? (
              <p>You have no lost item reports.</p>
            ) : (
              lostItems.map((item) => (
                <div
                  key={`my-lost-${item.id}`}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 10,
                    padding: 15,
                    marginBottom: 15,
                  }}
                >
                  <h3>{item.item_name}</h3>
                  <p>{item.description}</p>
                  <p>
                    <strong>Location:</strong> {item.location}
                  </p>
                </div>
              ))
            )}

            <h3>🎁 My Found Reports</h3>

            {foundItems.length === 0 ? (
              <p>You have no found item reports.</p>
            ) : (
              foundItems.map((item) => (
                <div
                  key={`my-found-${item.id}`}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 10,
                    padding: 15,
                    marginBottom: 15,
                  }}
                >
                  <h3>{item.item_name}</h3>
                  <p>{item.description}</p>
                  <p>
                    <strong>Location:</strong> {item.location}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ADMIN DASHBOARD */}

        {showAdmin && role === "admin" && (
          <div
            style={{
              marginTop: 30,
              marginBottom: 40,
              padding: 20,
              border: "2px solid #444",
              borderRadius: 10,
            }}
          >
            <h2>🛠️ Admin Dashboard</h2>

            <h3>👥 Profiles ({profiles.length})</h3>

            {profiles.map((profile) => (
              <div
                key={profile.id}
                style={{
                  borderBottom: "1px solid #ddd",
                  padding: 10,
                }}
              >
                <strong>{profile.name}</strong>
                <br />
                {profile.email}
                <br />
                Role: {profile.role}
              </div>
            ))}

            <br />

            <h3>📦 All Lost Items ({adminLostItems.length})</h3>

            {adminLostItems.length === 0 ? (
              <p>No lost items.</p>
            ) : (
              adminLostItems.map((item) => (
                <div
                  key={`admin-lost-${item.id}`}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 10,
                    padding: 15,
                    marginBottom: 15,
                  }}
                >
                  <h4>📦 {item.item_name}</h4>

                  <p>{item.description}</p>

                  <p>
                    Location: {item.location}
                  </p>

                  <p>
                    Reporter: {item.user_email}
                  </p>

                  <button
                    onClick={() => deleteLostItem(item.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))
            )}

            <h3>🎁 All Found Items ({adminFoundItems.length})</h3>

            {adminFoundItems.length === 0 ? (
              <p>No found items.</p>
            ) : (
              adminFoundItems.map((item) => (
                <div
                  key={`admin-found-${item.id}`}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 10,
                    padding: 15,
                    marginBottom: 15,
                  }}
                >
                  <h4>🎁 {item.item_name}</h4>

                  <p>{item.description}</p>

                  <p>
                    Location: {item.location}
                  </p>

                  <p>
                    Reporter: {item.user_email}
                  </p>

                  <button
                    onClick={() => deleteFoundItem(item.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* LOGOUT */}

        <button
          onClick={logout}
          style={{
            display: "block",
            marginTop: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          🚪 Logout
        </button>
      </div>
    );
  }

  // =========================
  // LOGIN / SIGNUP SCREEN
  // =========================

  return (
    <div
      style={{
        padding: 40,
        maxWidth: 600,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>🎒 BackToYou</h1>

      <h2>{isLogin ? "Login" : "Create Account"}</h2>

      {!isLogin && (
        <>
          <input
            type="text"
            placeholder="Enter Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: "block",
              marginBottom: 15,
              padding: 10,
              width: "100%",
            }}
          />
        </>
      )}

      <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          display: "block",
          marginBottom: 15,
          padding: 10,
          width: "100%",
        }}
      />

      <input
        type="password"
        placeholder="Enter Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          display: "block",
          marginBottom: 15,
          padding: 10,
          width: "100%",
        }}
      />

      {isLogin ? (
        <button onClick={login}>Login</button>
      ) : (
        <button onClick={signUp}>Sign Up</button>
      )}

      <br />
      <br />

      <button
        onClick={() => setIsLogin(!isLogin)}
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