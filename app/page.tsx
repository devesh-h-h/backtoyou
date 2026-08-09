"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = {
  id: number;
  item_name: string;
  description: string;
  location: string;
  user_email?: string;
  image_url?: string | null;
  created_at?: string;
  status?: "available" | "claimed" | "returned";
};

type PossibleMatch = Item & {
  score: number;
};

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  contact_email_enabled?: boolean;
  contact_phone_enabled?: boolean;
  contact_in_app_chat_enabled?: boolean;
};

type Claim = {
  id: number;
  item_id: number;
  lost_item_id: number | null;
  claimant_email: string;
  claim_message: string;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
};

type ApprovedClaimContact = {
  claim_id: number;
  lost_item_name: string;
  found_item_name: string;
  claimant_email: string | null;
  claimant_phone: string | null;
  claimant_allows_in_app_chat: boolean;
  finder_email: string | null;
  finder_phone: string | null;
  finder_allows_in_app_chat: boolean;
  item_status: "claimed" | "returned";
};

type ContactPreferenceValues = {
  phone: string | null;
  contact_email_enabled: boolean;
  contact_phone_enabled: boolean;
  contact_in_app_chat_enabled: boolean;
};

const COMMON_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "is",
  "of",
  "with",
  "near",
  "in",
  "at",
  "to",
  "my",
  "this",
  "that",
]);

function getKeywords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !COMMON_WORDS.has(word))
  );
}

function hasMatchingKeyword(firstText: string, secondText: string) {
  const firstKeywords = getKeywords(firstText);
  const secondKeywords = getKeywords(secondText);

  return [...firstKeywords].some((word) =>
    secondKeywords.has(word)
  );
}

function getPossibleMatches(
  lostItem: Item,
  foundItems: Item[]
): PossibleMatch[] {
  return foundItems
    .filter((foundItem) => foundItem.status !== "returned")
    .map((foundItem): PossibleMatch => {
      let score = 0;

      if (
        hasMatchingKeyword(
          lostItem.item_name,
          foundItem.item_name
        )
      ) {
        score += 50;
      }

      if (
        hasMatchingKeyword(
          lostItem.location,
          foundItem.location
        )
      ) {
        score += 30;
      }

      if (
        hasMatchingKeyword(
          lostItem.description,
          foundItem.description
        )
      ) {
        score += 20;
      }

      return {
        ...foundItem,
        score,
      };
    })
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score);
}

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

  const [lostImage, setLostImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // =========================
  // FOUND ITEM STATES
  // =========================

  const [showFoundForm, setShowFoundForm] = useState(false);

  const [foundItemName, setFoundItemName] = useState("");
  const [foundDescription, setFoundDescription] = useState("");
  const [foundLocation, setFoundLocation] = useState("");

  const [foundImage, setFoundImage] = useState<File | null>(null);
  const [uploadingFoundImage, setUploadingFoundImage] =
    useState(false);

  // =========================
  // BROWSE ITEMS STATES
  // =========================

  const [showBrowse, setShowBrowse] = useState(false);

  const [lostItems, setLostItems] = useState<Item[]>([]);
  const [foundItems, setFoundItems] = useState<Item[]>([]);

  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseItemType, setBrowseItemType] = useState("all");
  const [browseLocation, setBrowseLocation] = useState("");

  const normalizedBrowseSearch = browseSearch.trim().toLowerCase();
  const normalizedBrowseLocation =
    browseLocation.trim().toLowerCase();

  function matchesBrowseFilters(item: Item) {
    const matchesSearch =
      !normalizedBrowseSearch ||
      item.item_name
        .toLowerCase()
        .includes(normalizedBrowseSearch) ||
      item.description
        .toLowerCase()
        .includes(normalizedBrowseSearch) ||
      item.location
        .toLowerCase()
        .includes(normalizedBrowseSearch);

    const matchesLocation =
      !normalizedBrowseLocation ||
      item.location
        .toLowerCase()
        .includes(normalizedBrowseLocation);

    return matchesSearch && matchesLocation;
  }

  const filteredLostItems =
    lostItems.filter(matchesBrowseFilters);

  const filteredFoundItems = foundItems
    .filter((item) => item.status !== "returned")
    .filter(matchesBrowseFilters);

  const hasBrowseMatches =
    ((browseItemType === "all" || browseItemType === "lost") &&
      filteredLostItems.length > 0) ||
    ((browseItemType === "all" || browseItemType === "found") &&
      filteredFoundItems.length > 0);

  // =========================
  // MY REPORTS STATES
  // =========================

  const [showMyReports, setShowMyReports] = useState(false);

  const [myFoundItems, setMyFoundItems] = useState<Item[]>([]);
  const [allFoundItems, setAllFoundItems] = useState<Item[]>([]);
  const [myClaims, setMyClaims] = useState<Claim[]>([]);

  const [
    approvedClaimContacts,
    setApprovedClaimContacts,
  ] = useState<ApprovedClaimContact[]>([]);

  const [
    approvedContactsError,
    setApprovedContactsError,
  ] = useState("");

  const [contactPhone, setContactPhone] = useState("");
  const [contactEmailEnabled, setContactEmailEnabled] =
    useState(true);

  const [contactPhoneEnabled, setContactPhoneEnabled] =
    useState(false);

  const [
    contactInAppChatEnabled,
    setContactInAppChatEnabled,
  ] = useState(false);

  const [
    savingContactPreferences,
    setSavingContactPreferences,
  ] = useState(false);

  const [claimItem, setClaimItem] =
    useState<Item | null>(null);

  const [claimLostItem, setClaimLostItem] =
    useState<Item | null>(null);

  const [claimMessage, setClaimMessage] = useState("");
  const [submittingClaim, setSubmittingClaim] =
    useState(false);

  // =========================
  // ADMIN STATES
  // =========================

  const [showAdmin, setShowAdmin] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminLostItems, setAdminLostItems] =
    useState<Item[]>([]);

  const [adminFoundItems, setAdminFoundItems] =
    useState<Item[]>([]);

  const [adminClaims, setAdminClaims] =
    useState<Claim[]>([]);

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
      options: {
        data: {
          name: name.trim() || "User",
        },
      },
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

    const { data: signInData, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      alert(error.message);
      return;
    }

    const authenticatedEmail = signInData.user?.email;
    const profile = await ensureCurrentUserProfile();

    if (profile) {
      setEmail(profile.email);
      setName(profile.name || "User");
      setRole(profile.role || "user");

      setContactPhone(profile.phone || "");

      setContactEmailEnabled(
        profile.contact_email_enabled ?? true
      );

      setContactPhoneEnabled(
        profile.contact_phone_enabled ?? false
      );

      setContactInAppChatEnabled(
        profile.contact_in_app_chat_enabled ?? false
      );
    } else {
      setEmail(authenticatedEmail || "");
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
    const profile = await ensureCurrentUserProfile();

    if (!profile) {
      alert(
        "Please sign in first. Your profile will be created automatically."
      );
      return;
    }

    const profileName =
      name.trim() || profile.name || "User";

    const { error } = await supabase
      .from("profiles")
      .update({ name: profileName })
      .eq("id", profile.id);

    if (error) {
      alert(error.message);
    } else {
      setName(profileName);
      alert("Profile saved!");
    }
  }

  // =========================
  // ENSURE CURRENT USER PROFILE
  // =========================

  async function ensureCurrentUserProfile(
    contactPreferences?: ContactPreferenceValues
  ): Promise<Profile | null> {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      console.error(
        "Could not ensure the authenticated user profile:",
        userError || "No authenticated user email found."
      );

      return null;
    }

    const {
      data: existingProfile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        "id, name, email, role, phone, contact_email_enabled, contact_phone_enabled, contact_in_app_chat_enabled"
      )
      .eq("email", user.email)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Could not load the authenticated user profile:",
        profileError
      );

      return null;
    }

    if (existingProfile) {
      return existingProfile;
    }

    const metadataName =
      typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : name.trim() || "User";

    const {
      data: createdProfile,
      error: createError,
    } = await supabase
      .from("profiles")
      .insert([
        {
          name: metadataName || "User",
          email: user.email,
          role: "user",
          phone: contactPreferences?.phone ?? null,

          contact_email_enabled:
            contactPreferences?.contact_email_enabled ?? true,

          contact_phone_enabled:
            contactPreferences?.contact_phone_enabled ?? false,

          contact_in_app_chat_enabled:
            contactPreferences?.contact_in_app_chat_enabled ?? false,
        },
      ])
      .select(
        "id, name, email, role, phone, contact_email_enabled, contact_phone_enabled, contact_in_app_chat_enabled"
      )
      .single();

    if (createError) {
      console.error(
        "Could not create the authenticated user profile:",
        createError
      );

      return null;
    }

    return createdProfile;
  }

  // =========================
  // SAVE CONTACT PREFERENCES
  // =========================

async function saveContactPreferences() {
  const trimmedPhone = contactPhone.trim();

  const preferences: ContactPreferenceValues = {
    phone: trimmedPhone || null,
    contact_email_enabled: contactEmailEnabled,
    contact_phone_enabled: contactPhoneEnabled,
    contact_in_app_chat_enabled: contactInAppChatEnabled,
  };

  setSavingContactPreferences(true);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    console.error(
      "Could not identify the authenticated user:",
      userError
    );

    alert(
      "Could not save contact preferences: please sign in again."
    );

    setSavingContactPreferences(false);
    return;
  }

  const profile = await ensureCurrentUserProfile();

  if (!profile) {
    alert(
      "Could not save contact preferences: your user profile could not be found."
    );

    setSavingContactPreferences(false);
    return;
  }

  // Update the exact profile using its ID.
  const { error } = await supabase
    .from("profiles")
    .update(preferences)
    .eq("id", profile.id);

  if (error) {
    console.error(
      "Could not save contact preferences:",
      error
    );

    alert(
      `Could not save contact preferences: ${error.message}`
    );

    setSavingContactPreferences(false);
    return;
  }

  // The values are already known locally, so there is no
  // need to request the updated row back from Supabase.
  setContactPhone(trimmedPhone);

  setContactEmailEnabled(
    preferences.contact_email_enabled
  );

  setContactPhoneEnabled(
    preferences.contact_phone_enabled
  );

  setContactInAppChatEnabled(
    preferences.contact_in_app_chat_enabled
  );

  alert("Contact preferences saved successfully.");

  setSavingContactPreferences(false);
}

  // =========================
  // IMAGE SELECTION
  // =========================

  function handleLostImageChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setLostImage(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      event.target.value = "";
      setLostImage(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5 MB.");
      event.target.value = "";
      setLostImage(null);
      return;
    }

    setLostImage(file);
  }

  function handleFoundImageChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setFoundImage(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      event.target.value = "";
      setFoundImage(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5 MB.");
      event.target.value = "";
      setFoundImage(null);
      return;
    }

    setFoundImage(file);
  }

  // =========================
  // REPORT LOST ITEM
  // =========================

  async function reportLostItem() {
    if (!itemName || !description || !location) {
      alert("Please fill all required fields.");
      return;
    }

    setUploadingImage(true);

    let imageUrl: string | null = null;

    if (lostImage) {
      const safeFileName = lostImage.name.replace(
        /[^a-zA-Z0-9.-]/g,
        "_"
      );

      const filePath =
        `${Date.now()}-${safeFileName}`;

      const { error: uploadError } =
        await supabase.storage
          .from("item-images")
          .upload(filePath, lostImage);

      if (uploadError) {
        console.log(uploadError);

        alert(
          "Image upload failed: " +
            uploadError.message
        );

        setUploadingImage(false);
        return;
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("item-images")
          .getPublicUrl(filePath);

      imageUrl =
        publicUrlData.publicUrl;
    }

    const { error } = await supabase
      .from("lost_items")
      .insert([
        {
          item_name: itemName,
          description,
          location,
          user_email: email,
          image_url: imageUrl,
        },
      ]);

    if (error) {
      alert(error.message);
      setUploadingImage(false);
      return;
    }

    alert(
      "Lost item reported successfully!"
    );

    setItemName("");
    setDescription("");
    setLocation("");
    setLostImage(null);

    setShowLostForm(false);
    setUploadingImage(false);

    if (showBrowse) {
      loadBrowseItems();
    }

    if (showMyReports) {
      loadMyReports();
    }
  }

  // =========================
  // REPORT FOUND ITEM
  // =========================

  async function reportFoundItem() {
    if (
      !foundItemName ||
      !foundDescription ||
      !foundLocation
    ) {
      alert("Please fill all required fields.");
      return;
    }

    setUploadingFoundImage(true);

    let imageUrl: string | null = null;

    if (foundImage) {
      const safeFileName =
        foundImage.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        );

      const filePath =
        `${Date.now()}-${safeFileName}`;

      const { error: uploadError } =
        await supabase.storage
          .from("item-images")
          .upload(filePath, foundImage);

      if (uploadError) {
        console.log(uploadError);

        alert(
          "Image upload failed: " +
            uploadError.message
        );

        setUploadingFoundImage(false);
        return;
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("item-images")
          .getPublicUrl(filePath);

      imageUrl =
        publicUrlData.publicUrl;
    }

    const { error } = await supabase
      .from("found_items")
      .insert([
        {
          item_name: foundItemName,
          description: foundDescription,
          location: foundLocation,
          user_email: email,
          image_url: imageUrl,
        },
      ]);

    if (error) {
      alert(error.message);
      setUploadingFoundImage(false);
      return;
    }

    alert(
      "Found item reported successfully!"
    );

    setFoundItemName("");
    setFoundDescription("");
    setFoundLocation("");
    setFoundImage(null);

    setShowFoundForm(false);
    setUploadingFoundImage(false);

    if (showBrowse) {
      loadBrowseItems();
    }

    if (showMyReports) {
      loadMyReports();
    }

    if (showAdmin) {
      loadAdminData();
    }
  }

  // =========================
  // BROWSE ITEMS
  // =========================

  async function loadBrowseItems() {
    setBrowseLoading(true);

    const {
      data: lostData,
      error: lostError,
    } = await supabase
      .from("lost_items")
      .select("*")
      .order("id", {
        ascending: false,
      });

    const {
      data: foundData,
      error: foundError,
    } = await supabase
      .from("found_items")
      .select(
        "id, item_name, description, location, image_url, created_at, status"
      )
      .order("id", {
        ascending: false,
      });

    if (lostError) {
      console.log(
        "Lost items error:",
        lostError
      );
    }

    if (foundError) {
      console.log(
        "Found items error:",
        foundError
      );
    }

    setLostItems(lostData || []);
    setFoundItems(foundData || []);

    setBrowseLoading(false);
  }

  function openBrowse() {
    setShowBrowse(true);
    setShowMyReports(false);
    setShowAdmin(false);
    setShowLostForm(false);
    setShowFoundForm(false);

    loadBrowseItems();
  }

  // =========================
  // CLAIMS
  // =========================

  function openClaimForm(
    item: Item,
    lostItem: Item
  ) {
    if (
      item.status &&
      item.status !== "available"
    ) {
      alert(
        "This found item is no longer available for new claims."
      );

      return;
    }

    setClaimItem(item);
    setClaimLostItem(lostItem);
    setClaimMessage("");
  }

  function cancelClaim() {
    setClaimItem(null);
    setClaimLostItem(null);
    setClaimMessage("");
  }

  async function submitClaim() {
    const trimmedMessage =
      claimMessage.trim();

    if (
      !claimItem ||
      !claimLostItem ||
      !trimmedMessage
    ) {
      alert(
        "Please select a lost report and enter a claim message."
      );

      return;
    }

    setSubmittingClaim(true);

    const {
      data: pendingClaim,
      error: pendingClaimError,
    } = await supabase
      .from("claims")
      .select("id")
      .eq("item_id", claimItem.id)
      .eq("claimant_email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingClaimError) {
      alert(pendingClaimError.message);
      setSubmittingClaim(false);
      return;
    }

    if (pendingClaim) {
      alert(
        "You already have a pending claim for this item."
      );

      setSubmittingClaim(false);
      return;
    }

    const { error } =
      await supabase.from("claims").insert([
        {
          item_id: claimItem.id,
          lost_item_id: claimLostItem.id,
          claimant_email: email,
          claim_message: trimmedMessage,
          status: "pending",
        },
      ]);

    if (error) {
      if (error.code === "23505") {
        alert(
          "You already have a pending claim for this item."
        );
      } else {
        alert(error.message);
      }

      setSubmittingClaim(false);
      return;
    }

    alert(
      "Claim submitted successfully. Contact details are hidden until an admin approves the claim."
    );

    cancelClaim();
    setSubmittingClaim(false);

    if (showMyReports) {
      loadMyReports();
    }
  }

  // =========================
  // MY REPORTS
  // =========================

  async function loadMyReports() {
    const profile =
      await ensureCurrentUserProfile();

    if (profile) {
      setContactPhone(
        profile.phone || ""
      );

      setContactEmailEnabled(
        profile.contact_email_enabled ?? true
      );

      setContactPhoneEnabled(
        profile.contact_phone_enabled ?? false
      );

      setContactInAppChatEnabled(
        profile.contact_in_app_chat_enabled ?? false
      );
    } else {
      console.error(
        "Could not load contact preferences for My Reports."
      );
    }

    const {
      data: lostData,
      error: lostError,
    } = await supabase
      .from("lost_items")
      .select("*")
      .eq("user_email", email)
      .order("id", {
        ascending: false,
      });

    const {
      data: foundData,
      error: foundError,
    } = await supabase
      .from("found_items")
      .select(
        "id, item_name, description, location, image_url, created_at, status"
      )
      .order("id", {
        ascending: false,
      });

    const {
      data: myFoundData,
      error: myFoundError,
    } = await supabase
      .from("found_items")
      .select("*")
      .eq("user_email", email)
      .order("id", {
        ascending: false,
      });

    const {
      data: claimsData,
      error: claimsError,
    } = await supabase
      .from("claims")
      .select("*")
      .eq("claimant_email", email)
      .order("created_at", {
        ascending: false,
      });

    const {
      data: contactData,
      error: contactError,
    } = await supabase.rpc(
      "get_approved_claim_contacts"
    );

    if (lostError) {
      console.log(lostError);
    }

    if (foundError) {
      console.log(foundError);
    }

    if (myFoundError) {
      console.log(myFoundError);
    }

    if (claimsError) {
      console.log(claimsError);
    }

    if (contactError) {
      console.log(contactError);

      setApprovedContactsError(
        `Could not load approved contact information: ${contactError.message}`
      );
    } else {
      setApprovedContactsError("");
    }

    setLostItems(
      lostData || []
    );

    setAllFoundItems(
      foundData || []
    );

    setMyFoundItems(
      myFoundData || []
    );

    setMyClaims(
      claimsData || []
    );

    setApprovedClaimContacts(
      contactData || []
    );
  }

  function openMyReports() {
    setShowMyReports(true);
    setShowBrowse(false);
    setShowAdmin(false);
    setShowLostForm(false);
    setShowFoundForm(false);

    loadMyReports();
  }

  // =========================
  // ADMIN DASHBOARD
  // =========================

  async function loadAdminData() {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    const {
      data: lostData,
      error: lostError,
    } = await supabase
      .from("lost_items")
      .select("*")
      .order("id", {
        ascending: false,
      });

    const {
      data: foundData,
      error: foundError,
    } = await supabase
      .from("found_items")
      .select("*")
      .order("id", {
        ascending: false,
      });

    const {
      data: claimsData,
      error: claimsError,
    } = await supabase
      .from("claims")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (profileError) {
      console.log(profileError);
    }

    if (lostError) {
      console.log(lostError);
    }

    if (foundError) {
      console.log(foundError);
    }

    if (claimsError) {
      console.log(claimsError);
    }

    setProfiles(
      profileData || []
    );

    setAdminLostItems(
      lostData || []
    );

    setAdminFoundItems(
      foundData || []
    );

    setAdminClaims(
      claimsData || []
    );
  }

  function openAdminDashboard() {
    setShowAdmin(true);
    setShowBrowse(false);
    setShowMyReports(false);
    setShowLostForm(false);
    setShowFoundForm(false);

    loadAdminData();
  }

  async function updateClaimStatus(
    claimId: number,
    status: "approved" | "rejected"
  ) {
    if (role !== "admin") {
      return;
    }

    const { error } =
      await supabase
        .from("claims")
        .update({ status })
        .eq("id", claimId);

    if (error) {
      alert(error.message);
      return;
    }

    setAdminClaims((claims) =>
      claims.map((claim) =>
        claim.id === claimId
          ? {
              ...claim,
              status,
            }
          : claim
      )
    );

    if (status === "approved") {
      await loadAdminData();
    }
  }

  async function markFoundItemReturned(
    itemId: number
  ) {
    if (role !== "admin") {
      return;
    }

    const { error } =
      await supabase
        .from("found_items")
        .update({
          status: "returned",
        })
        .eq("id", itemId);

    if (error) {
      alert(error.message);
      return;
    }

    setAdminFoundItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "returned",
            }
          : item
      )
    );
  }

  // =========================
  // DELETE LOST ITEM
  // =========================

  async function deleteLostItem(
    id: number
  ) {
    const confirmed = confirm(
      "Are you sure you want to delete this lost item?"
    );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabase
        .from("lost_items")
        .delete()
        .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Lost item deleted.");

    setAdminLostItems((items) =>
      items.filter(
        (item) => item.id !== id
      )
    );

    setLostItems((items) =>
      items.filter(
        (item) => item.id !== id
      )
    );
  }

  // =========================
  // DELETE FOUND ITEM
  // =========================

  async function deleteFoundItem(
    id: number
  ) {
    const confirmed = confirm(
      "Are you sure you want to delete this found item?"
    );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabase
        .from("found_items")
        .delete()
        .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Found item deleted.");

    setAdminFoundItems((items) =>
      items.filter(
        (item) => item.id !== id
      )
    );

    setFoundItems((items) =>
      items.filter(
        (item) => item.id !== id
      )
    );
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

    setContactPhone("");
    setContactEmailEnabled(true);
    setContactPhoneEnabled(false);
    setContactInAppChatEnabled(false);

    setApprovedClaimContacts([]);
    setApprovedContactsError("");

    setShowBrowse(false);
    setShowMyReports(false);
    setShowAdmin(false);
    setShowLostForm(false);
    setShowFoundForm(false);

    setMyClaims([]);
    setAdminClaims([]);

    cancelClaim();
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
        const userEmail =
          session.user.email;

        setEmail(userEmail);

        const profile =
          await ensureCurrentUserProfile();

        if (profile) {
          setEmail(profile.email);
          setName(
            profile.name || "User"
          );

          setRole(
            profile.role || "user"
          );

          setContactPhone(
            profile.phone || ""
          );

          setContactEmailEnabled(
            profile.contact_email_enabled ?? true
          );

          setContactPhoneEnabled(
            profile.contact_phone_enabled ?? false
          );

          setContactInAppChatEnabled(
            profile.contact_in_app_chat_enabled ?? false
          );
        } else {
          setName("User");
          setRole("user");
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

        <h2>
          Welcome, {name || "User"} 👋
        </h2>

        <br />

        {/* ADMIN */}

        {role === "admin" && (
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
        )}

        {/* LOST ITEM */}

        <button
          onClick={() => {
            setShowLostForm(
              !showLostForm
            );

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
            <h3>
              📦 Report Lost Item
            </h3>

            <input
              type="text"
              placeholder="Item Name"
              value={itemName}
              onChange={(e) =>
                setItemName(
                  e.target.value
                )
              }
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
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
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
              onChange={(e) =>
                setLocation(
                  e.target.value
                )
              }
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <div
              style={{
                marginBottom: 20,
                padding: 15,
                border: "1px dashed #888",
                borderRadius: 10,
                maxWidth: 500,
              }}
            >
              <label
                style={{
                  display: "block",
                  marginBottom: 10,
                  fontWeight: "bold",
                }}
              >
                🖼️ Upload Image of Lost Item
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={
                  handleLostImageChange
                }
              />

              <p
                style={{
                  fontSize: 13,
                  color: "#666",
                  marginTop: 8,
                }}
              >
                Optional • JPG, PNG, WEBP etc. •
                Maximum 5 MB
              </p>

              {lostImage && (
                <div
                  style={{
                    marginTop: 10,
                  }}
                >
                  <p>
                    Selected:{" "}
                    <strong>
                      {lostImage.name}
                    </strong>
                  </p>

                  <img
                    src={URL.createObjectURL(
                      lostImage
                    )}
                    alt="Selected lost item"
                    style={{
                      width: 200,
                      maxHeight: 200,
                      objectFit: "cover",
                      borderRadius: 10,
                      border:
                        "1px solid #ccc",
                    }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={
                reportLostItem
              }
              disabled={
                uploadingImage
              }
              style={{
                padding: 10,
                fontSize: 16,
              }}
            >
              {uploadingImage
                ? "Uploading..."
                : "Submit Lost Item Report"}
            </button>
          </div>
        )}

        {/* FOUND ITEM */}

        <button
          onClick={() => {
            setShowFoundForm(
              !showFoundForm
            );

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
            <h3>
              🎁 Report Found Item
            </h3>

            <input
              type="text"
              placeholder="Item Name"
              value={foundItemName}
              onChange={(e) =>
                setFoundItemName(
                  e.target.value
                )
              }
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
              onChange={(e) =>
                setFoundDescription(
                  e.target.value
                )
              }
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
              onChange={(e) =>
                setFoundLocation(
                  e.target.value
                )
              }
              style={{
                display: "block",
                marginBottom: 15,
                padding: 10,
                width: "100%",
                maxWidth: 500,
              }}
            />

            <div
              style={{
                marginBottom: 20,
                padding: 15,
                border: "1px dashed #888",
                borderRadius: 10,
                maxWidth: 500,
              }}
            >
              <label
                style={{
                  display: "block",
                  marginBottom: 10,
                  fontWeight: "bold",
                }}
              >
                🖼️ Upload Image of Found Item
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={
                  handleFoundImageChange
                }
              />

              <p
                style={{
                  fontSize: 13,
                  color: "#666",
                  marginTop: 8,
                }}
              >
                Optional • JPG, PNG, WEBP etc. •
                Maximum 5 MB
              </p>

              {foundImage && (
                <div
                  style={{
                    marginTop: 10,
                  }}
                >
                  <p>
                    Selected:{" "}
                    <strong>
                      {foundImage.name}
                    </strong>
                  </p>

                  <img
                    src={URL.createObjectURL(
                      foundImage
                    )}
                    alt="Selected found item"
                    style={{
                      width: 200,
                      maxHeight: 200,
                      objectFit: "cover",
                      borderRadius: 10,
                      border:
                        "1px solid #ccc",
                    }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={
                reportFoundItem
              }
              disabled={
                uploadingFoundImage
              }
              style={{
                padding: 10,
                fontSize: 16,
              }}
            >
              {uploadingFoundImage
                ? "Uploading..."
                : "Submit Found Item Report"}
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
          <div
            style={{
              marginTop: 20,
              marginBottom: 40,
            }}
          >
            <h2>
              🔍 Browse Items
            </h2>

            <div
              style={{
                marginBottom: 20,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <input
                type="text"
                placeholder="Search items..."
                value={
                  browseSearch
                }
                onChange={(e) =>
                  setBrowseSearch(
                    e.target.value
                  )
                }
                style={{
                  padding: 10,
                  minWidth: 200,
                }}
              />

              <select
                value={
                  browseItemType
                }
                onChange={(e) =>
                  setBrowseItemType(
                    e.target.value
                  )
                }
                style={{
                  padding: 10,
                }}
              >
                <option value="all">
                  All Items
                </option>

                <option value="lost">
                  Lost Items
                </option>

                <option value="found">
                  Found Items
                </option>
              </select>

              <input
                type="text"
                placeholder="Filter by location..."
                value={
                  browseLocation
                }
                onChange={(e) =>
                  setBrowseLocation(
                    e.target.value
                  )
                }
                style={{
                  padding: 10,
                  minWidth: 200,
                }}
              />
            </div>

            {!browseLoading &&
              !hasBrowseMatches && (
                <p>
                  No items match your
                  search.
                </p>
              )}

            {browseLoading ? (
              <p>
                Loading items...
              </p>
            ) : (
              <>
                <h3>
                  📦 Lost Items
                </h3>

                {browseItemType ===
                  "found" ||
                filteredLostItems.length ===
                  0
                  ? null
                  : filteredLostItems.map(
                      (item) => (
                        <div
                          key={`lost-${item.id}`}
                          style={{
                            border:
                              "1px solid #ccc",
                            borderRadius: 10,
                            padding: 15,
                            marginBottom: 15,
                          }}
                        >
                          <h3>
                            📦{" "}
                            {item.item_name}
                          </h3>

                          {item.image_url && (
                            <img
                              src={
                                item.image_url
                              }
                              alt={
                                item.item_name
                              }
                              style={{
                                width: 250,
                                maxHeight: 250,
                                objectFit:
                                  "cover",
                                borderRadius: 10,
                                border:
                                  "1px solid #ccc",
                                marginBottom: 15,
                              }}
                            />
                          )}

                          <p>
                            <strong>
                              Description:
                            </strong>{" "}
                            {
                              item.description
                            }
                          </p>

                          <p>
                            <strong>
                              Location:
                            </strong>{" "}
                            {
                              item.location
                            }
                          </p>

                          {item.created_at && (
                            <p>
                              <strong>
                                Reported on:
                              </strong>{" "}
                              {new Date(
                                item.created_at
                              ).toLocaleString()}
                            </p>
                          )}

                          <strong>
                            STATUS: LOST
                          </strong>
                        </div>
                      )
                    )}

                <br />

                <h3>
                  🎁 Found Items
                </h3>

                {browseItemType ===
                  "lost" ||
                filteredFoundItems.length ===
                  0
                  ? null
                  : filteredFoundItems.map(
                      (item) => (
                        <div
                          key={`found-${item.id}`}
                          style={{
                            border:
                              "1px solid #ccc",
                            borderRadius: 10,
                            padding: 15,
                            marginBottom: 15,
                          }}
                        >
                          {item.image_url && (
                            <img
                              src={
                                item.image_url
                              }
                              alt={
                                item.item_name
                              }
                              style={{
                                width: 250,
                                maxHeight: 250,
                                objectFit:
                                  "cover",
                                borderRadius: 10,
                                border:
                                  "1px solid #ccc",
                                marginBottom: 15,
                              }}
                            />
                          )}

                          <h3>
                            🎁{" "}
                            {item.item_name}
                          </h3>

                          <p>
                            <strong>
                              Description:
                            </strong>{" "}
                            {
                              item.description
                            }
                          </p>

                          <p>
                            <strong>
                              Location:
                            </strong>{" "}
                            {
                              item.location
                            }
                          </p>

                          {item.created_at && (
                            <p>
                              <strong>
                                Reported on:
                              </strong>{" "}
                              {new Date(
                                item.created_at
                              ).toLocaleString()}
                            </p>
                          )}

                          <strong>
                            STATUS:{" "}
                            {(
                              item.status ||
                              "available"
                            ).toUpperCase()}
                          </strong>

                          <br />
                          <br />

                          {item.status ===
                          "claimed" ? (
                            <p
                              style={{
                                fontSize: 13,
                                color: "#666",
                              }}
                            >
                              This item
                              has already
                              been claimed.
                            </p>
                          ) : (
                            <p
                              style={{
                                fontSize: 13,
                                color: "#666",
                              }}
                            >
                              Available to
                              claim from
                              the Possible
                              Matches
                              section of
                              the lost
                              report it
                              belongs to.
                            </p>
                          )}
                        </div>
                      )
                    )}
              </>
            )}

            {claimItem && (
              <div
                style={{
                  marginTop: 20,
                  padding: 20,
                  border:
                    "1px solid gray",
                  borderRadius: 10,
                  maxWidth: 500,
                }}
              >
                <h3>
                  Claim This Item
                </h3>

                <p>
                  <strong>
                    Item:
                  </strong>{" "}
                  {claimItem.item_name}
                </p>

                <p>
                  <strong>
                    Lost report:
                  </strong>{" "}
                  {
                    claimLostItem?.item_name
                  }
                </p>

                <p
                  style={{
                    fontSize: 13,
                    color: "#666",
                  }}
                >
                  Your contact details
                  will remain private
                  until an admin approves
                  the claim.
                </p>

                <textarea
                  placeholder="Explain why you believe this item belongs to you"
                  value={claimMessage}
                  onChange={(event) =>
                    setClaimMessage(
                      event.target.value
                    )
                  }
                  style={{
                    display: "block",
                    marginBottom: 15,
                    padding: 10,
                    width: "100%",
                    minHeight: 100,
                  }}
                />

                <button
                  onClick={
                    submitClaim
                  }
                  disabled={
                    submittingClaim
                  }
                  style={{
                    marginRight: 10,
                  }}
                >
                  {submittingClaim
                    ? "Submitting..."
                    : "Submit Claim"}
                </button>

                <button
                  onClick={cancelClaim}
                  disabled={
                    submittingClaim
                  }
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* MY REPORTS */}

        <button
          onClick={
            openMyReports
          }
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
          <div
            style={{
              marginBottom: 40,
            }}
          >
            <h2>
              👤 My Reports
            </h2>

            <h3>
              📦 My Lost Reports
            </h3>

            {lostItems.length ===
            0 ? (
              <p>
                You have no lost
                item reports.
              </p>
            ) : (
              lostItems.map(
                (item) => {
                  const matches =
                    getPossibleMatches(
                      item,
                      allFoundItems
                    );

                  return (
                    <div
                      key={`my-lost-${item.id}`}
                      style={{
                        border:
                          "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      <h3>
                        📦{" "}
                        {item.item_name}
                      </h3>

                      {item.image_url && (
                        <img
                          src={
                            item.image_url
                          }
                          alt={
                            item.item_name
                          }
                          style={{
                            width: 250,
                            maxHeight: 250,
                            objectFit:
                              "cover",
                            borderRadius: 10,
                            border:
                              "1px solid #ccc",
                            marginBottom: 15,
                          }}
                        />
                      )}

                      <p>
                        <strong>
                          Description:
                        </strong>{" "}
                        {
                          item.description
                        }
                      </p>

                      <p>
                        <strong>
                          Location:
                        </strong>{" "}
                        {
                          item.location
                        }
                      </p>

                      {item.created_at && (
                        <p>
                          <strong>
                            Reported on:
                          </strong>{" "}
                          {new Date(
                            item.created_at
                          ).toLocaleString()}
                        </p>
                      )}

                      <strong>
                        STATUS: LOST
                      </strong>

                      <div
                        style={{
                          marginTop: 20,
                          paddingTop: 15,
                          borderTop:
                            "1px solid #ddd",
                        }}
                      >
                        <h4>
                          🔎 Possible Matches
                        </h4>

                        {matches.length ===
                        0 ? (
                          <p>
                            No possible
                            matches found
                            yet.
                          </p>
                        ) : (
                          matches.map(
                            (match) => (
                              <div
                                key={`match-${item.id}-${match.id}`}
                                style={{
                                  padding: 12,
                                  marginBottom: 12,
                                  border:
                                    "1px solid #ddd",
                                  borderRadius: 8,
                                }}
                              >
                                <h4>
                                  🎁{" "}
                                  {
                                    match.item_name
                                  }
                                </h4>

                                {match.image_url && (
                                  <img
                                    src={
                                      match.image_url
                                    }
                                    alt={
                                      match.item_name
                                    }
                                    style={{
                                      width: 180,
                                      maxHeight: 180,
                                      objectFit:
                                        "cover",
                                      borderRadius: 8,
                                      border:
                                        "1px solid #ccc",
                                      marginBottom: 10,
                                    }}
                                  />
                                )}

                                <p>
                                  <strong>
                                    Location:
                                  </strong>{" "}
                                  {
                                    match.location
                                  }
                                </p>

                                <p>
                                  <strong>
                                    Description:
                                  </strong>{" "}
                                  {
                                    match.description
                                  }
                                </p>

                                <p>
                                  <strong>
                                    Match Score:
                                  </strong>{" "}
                                  {
                                    match.score
                                  }
                                  %
                                </p>

                                <p>
                                  <strong>
                                    Item Status:
                                  </strong>{" "}
                                  {(
                                    match.status ||
                                    "available"
                                  ).toUpperCase()}
                                </p>

                                <button
                                  onClick={
                                    openBrowse
                                  }
                                  style={{
                                    marginRight: 10,
                                  }}
                                >
                                  View in
                                  Browse Items
                                </button>

                                {(
                                  match.status ||
                                  "available"
                                ) ===
                                "available" ? (
                                  <button
                                    onClick={() =>
                                      openClaimForm(
                                        match,
                                        item
                                      )
                                    }
                                  >
                                    Claim This Item
                                  </button>
                                ) : (
                                  <span
                                    style={{
                                      color:
                                        "#666",
                                    }}
                                  >
                                    This item
                                    has already
                                    been claimed.
                                  </span>
                                )}
                              </div>
                            )
                          )
                        )}

                        <p
                          style={{
                            fontSize: 13,
                            color: "#666",
                          }}
                        >
                          This is a
                          possible match
                          based on item
                          details. Please
                          verify the item
                          before claiming
                          it.
                        </p>
                      </div>
                    </div>
                  );
                }
              )
            )}

            <h3>
              🎁 My Found Reports
            </h3>

            {myFoundItems.length ===
            0 ? (
              <p>
                You have no found
                item reports.
              </p>
            ) : (
              myFoundItems.map(
                (item) => (
                  <div
                    key={`my-found-${item.id}`}
                    style={{
                      border:
                        "1px solid #ccc",
                      borderRadius: 10,
                      padding: 15,
                      marginBottom: 15,
                    }}
                  >
                    {item.image_url && (
                      <img
                        src={
                          item.image_url
                        }
                        alt={
                          item.item_name
                        }
                        style={{
                          width: 250,
                          maxHeight: 250,
                          objectFit:
                            "cover",
                          borderRadius: 10,
                          border:
                            "1px solid #ccc",
                          marginBottom: 15,
                        }}
                      />
                    )}

                    <h3>
                      🎁{" "}
                      {item.item_name}
                    </h3>

                    <p>
                      <strong>
                        Description:
                      </strong>{" "}
                      {
                        item.description
                      }
                    </p>

                    <p>
                      <strong>
                        Location:
                      </strong>{" "}
                      {item.location}
                    </p>

                    {item.created_at && (
                      <p>
                        <strong>
                          Reported on:
                        </strong>{" "}
                        {new Date(
                          item.created_at
                        ).toLocaleString()}
                      </p>
                    )}

                    <strong>
                      STATUS:{" "}
                      {(
                        item.status ||
                        "available"
                      ).toUpperCase()}
                    </strong>
                  </div>
                )
              )
            )}

            {/* CONTACT PREFERENCES */}

            <h3>
              Contact Preferences
            </h3>

            <div
              style={{
                border:
                  "1px solid #ccc",
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  color: "#666",
                }}
              >
                Choose the methods
                you are willing to
                share only after an
                admin approves a claim.
              </p>

              <label
                style={{
                  display: "block",
                  marginBottom: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    contactEmailEnabled
                  }
                  onChange={(event) =>
                    setContactEmailEnabled(
                      event.target.checked
                    )
                  }
                />{" "}
                Email
              </label>

              <label
                style={{
                  display: "block",
                  marginBottom: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    contactPhoneEnabled
                  }
                  onChange={(event) =>
                    setContactPhoneEnabled(
                      event.target.checked
                    )
                  }
                />{" "}
                Phone
              </label>

              <input
                type="tel"
                placeholder="Phone number (optional)"
                value={
                  contactPhone
                }
                onChange={(event) =>
                  setContactPhone(
                    event.target.value
                  )
                }
                style={{
                  display: "block",
                  marginBottom: 10,
                  padding: 8,
                }}
              />

              <label
                style={{
                  display: "block",
                  marginBottom: 15,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    contactInAppChatEnabled
                  }
                  onChange={(event) =>
                    setContactInAppChatEnabled(
                      event.target.checked
                    )
                  }
                />{" "}
                In-app Chat (coming soon)
              </label>

              <button
                onClick={
                  saveContactPreferences
                }
                disabled={
                  savingContactPreferences
                }
              >
                {savingContactPreferences
                  ? "Saving..."
                  : "Save Contact Preferences"}
              </button>
            </div>

            {/* APPROVED CLAIMS */}

            <h3>
              🤝 Approved Claims
            </h3>

            {approvedContactsError ? (
              <p
                style={{
                  color: "#b00020",
                }}
              >
                {approvedContactsError}
              </p>
            ) : approvedClaimContacts.length ===
              0 ? (
              <p
                style={{
                  color: "#666",
                }}
              >
                Contact details are
                hidden until an admin
                approves the claim.
              </p>
            ) : (
              approvedClaimContacts.map(
                (contact) => {
                  const isClaimant =
                    myClaims.some(
                      (claim) =>
                        claim.id ===
                        contact.claim_id
                    );

                  const otherEmail =
                    isClaimant
                      ? contact.finder_email
                      : contact.claimant_email;

                  const otherPhone =
                    isClaimant
                      ? contact.finder_phone
                      : contact.claimant_phone;

                  const otherAllowsChat =
                    isClaimant
                      ? contact.finder_allows_in_app_chat
                      : contact.claimant_allows_in_app_chat;

                  const hasSharedMethod =
                    Boolean(
                      otherEmail ||
                        otherPhone ||
                        otherAllowsChat
                    );

                  return (
                    <div
                      key={`approved-contact-${contact.claim_id}`}
                      style={{
                        border:
                          "1px solid #8abf88",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                        background:
                          "#f5fff4",
                      }}
                    >
                      <p>
                        <strong>
                          Lost Item:
                        </strong>{" "}
                        {
                          contact.lost_item_name
                        }
                      </p>

                      <p>
                        <strong>
                          Found Item:
                        </strong>{" "}
                        {
                          contact.found_item_name
                        }
                      </p>

                      <p>
                        <strong>
                          Claim Status:
                        </strong>{" "}
                        APPROVED
                      </p>

                      <p>
                        <strong>
                          Item Status:
                        </strong>{" "}
                        {contact.item_status.toUpperCase()}
                      </p>

                      <p>
                        Your claim has
                        been approved.
                        Please use an
                        available contact
                        method to arrange
                        the return of the
                        item.
                      </p>

                      {!hasSharedMethod && (
                        <p
                          style={{
                            color: "#666",
                          }}
                        >
                          The other person
                          has not shared a
                          contact method.
                        </p>
                      )}

                      {otherEmail && (
                        <a
                          href={`mailto:${encodeURIComponent(
                            otherEmail
                          )}`}
                          style={{
                            marginRight: 12,
                          }}
                        >
                          📧 Contact by Email
                        </a>
                      )}

                      {otherPhone && (
                        <a
                          href={`tel:${encodeURIComponent(
                            otherPhone
                          )}`}
                          style={{
                            marginRight: 12,
                          }}
                        >
                          📱 Contact by Phone
                        </a>
                      )}

                      {otherAllowsChat && (
                        <span
                          style={{
                            color: "#666",
                          }}
                        >
                          💬 Chat (coming soon)
                        </span>
                      )}
                    </div>
                  );
                }
              )
            )}

            {/* MY CLAIMS */}

            <h3>
              My Claims
            </h3>

            {myClaims.length ===
            0 ? (
              <p>
                You have not submitted
                any claims.
              </p>
            ) : (
              myClaims.map(
                (claim) => {
                  const foundItem =
                    allFoundItems.find(
                      (item) =>
                        item.id ===
                        claim.item_id
                    );

                  const lostItem =
                    lostItems.find(
                      (item) =>
                        item.id ===
                        claim.lost_item_id
                    );

                  return (
                    <div
                      key={`my-claim-${claim.id}`}
                      style={{
                        border:
                          "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      <p>
                        <strong>
                          Found item:
                        </strong>{" "}
                        {
                          foundItem?.item_name ||
                          "Found item"
                        }
                      </p>

                      <p>
                        <strong>
                          Lost item:
                        </strong>{" "}
                        {
                          lostItem?.item_name ||
                          "Lost report"
                        }
                      </p>

                      <p>
                        <strong>
                          Claim message:
                        </strong>{" "}
                        {
                          claim.claim_message
                        }
                      </p>

                      <p>
                        <strong>
                          Status:
                        </strong>{" "}
                        {claim.status}
                      </p>

                      {claim.created_at && (
                        <p>
                          <strong>
                            Submitted:
                          </strong>{" "}
                          {new Date(
                            claim.created_at
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                  );
                }
              )
            )}
          </div>
        )}

        {/* ADMIN DASHBOARD */}

        {showAdmin &&
          role === "admin" && (
            <div
              style={{
                marginTop: 30,
                marginBottom: 40,
                padding: 20,
                border:
                  "2px solid #444",
                borderRadius: 10,
              }}
            >
              <h2>
                🛠️ Admin Dashboard
              </h2>

              <h3>
                👥 Profiles (
                {profiles.length})
              </h3>

              {profiles.map(
                (profile) => (
                  <div
                    key={profile.id}
                    style={{
                      borderBottom:
                        "1px solid #ddd",
                      padding: 10,
                    }}
                  >
                    <strong>
                      {profile.name}
                    </strong>

                    <br />

                    {profile.email}

                    <br />

                    Role: {profile.role}
                  </div>
                )
              )}

              <br />

              <h3>
                📦 All Lost Items (
                {
                  adminLostItems.length
                }
                )
              </h3>

              {adminLostItems.length ===
              0 ? (
                <p>
                  No lost items.
                </p>
              ) : (
                adminLostItems.map(
                  (item) => (
                    <div
                      key={`admin-lost-${item.id}`}
                      style={{
                        border:
                          "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      <h4>
                        📦{" "}
                        {
                          item.item_name
                        }
                      </h4>

                      {item.image_url && (
                        <img
                          src={
                            item.image_url
                          }
                          alt={
                            item.item_name
                          }
                          style={{
                            width: 250,
                            maxHeight: 250,
                            objectFit:
                              "cover",
                            borderRadius: 10,
                            border:
                              "1px solid #ccc",
                            marginBottom: 15,
                          }}
                        />
                      )}

                      <p>
                        <strong>
                          Description:
                        </strong>{" "}
                        {
                          item.description
                        }
                      </p>

                      <p>
                        <strong>
                          Location:
                        </strong>{" "}
                        {
                          item.location
                        }
                      </p>

                      <p>
                        <strong>
                          Reporter:
                        </strong>{" "}
                        {
                          item.user_email
                        }
                      </p>

                      {item.created_at && (
                        <p>
                          <strong>
                            Reported on:
                          </strong>{" "}
                          {new Date(
                            item.created_at
                          ).toLocaleString()}
                        </p>
                      )}

                      <button
                        onClick={() =>
                          deleteLostItem(
                            item.id
                          )
                        }
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )
                )
              )}

              <h3>
                🎁 All Found Items (
                {
                  adminFoundItems.length
                }
                )
              </h3>

              {adminFoundItems.length ===
              0 ? (
                <p>
                  No found items.
                </p>
              ) : (
                adminFoundItems.map(
                  (item) => (
                    <div
                      key={`admin-found-${item.id}`}
                      style={{
                        border:
                          "1px solid #ccc",
                        borderRadius: 10,
                        padding: 15,
                        marginBottom: 15,
                      }}
                    >
                      {item.image_url && (
                        <img
                          src={
                            item.image_url
                          }
                          alt={
                            item.item_name
                          }
                          style={{
                            width: 250,
                            maxHeight: 250,
                            objectFit:
                              "cover",
                            borderRadius: 10,
                            border:
                              "1px solid #ccc",
                            marginBottom: 15,
                          }}
                        />
                      )}

                      <h4>
                        🎁{" "}
                        {
                          item.item_name
                        }
                      </h4>

                      <p>
                        <strong>
                          Description:
                        </strong>{" "}
                        {
                          item.description
                        }
                      </p>

                      <p>
                        <strong>
                          Location:
                        </strong>{" "}
                        {
                          item.location
                        }
                      </p>

                      <p>
                        <strong>
                          Reporter:
                        </strong>{" "}
                        {
                          item.user_email
                        }
                      </p>

                      {item.created_at && (
                        <p>
                          <strong>
                            Reported on:
                          </strong>{" "}
                          {new Date(
                            item.created_at
                          ).toLocaleString()}
                        </p>
                      )}

                      <p>
                        <strong>
                          Item status:
                        </strong>{" "}
                        {(
                          item.status ||
                          "available"
                        ).toUpperCase()}
                      </p>

                      <button
                        onClick={() =>
                          deleteFoundItem(
                            item.id
                          )
                        }
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  )
                )
              )}

              <h3>
                Claims (
                {adminClaims.length})
              </h3>

              {adminClaims.length ===
              0 ? (
                <p>
                  No claims submitted.
                </p>
              ) : (
                adminClaims.map(
                  (claim) => {
                    const foundItem =
                      adminFoundItems.find(
                        (item) =>
                          item.id ===
                          claim.item_id
                      );

                    const lostItem =
                      adminLostItems.find(
                        (item) =>
                          item.id ===
                          claim.lost_item_id
                      );

                    return (
                      <div
                        key={`admin-claim-${claim.id}`}
                        style={{
                          border:
                            "1px solid #ccc",
                          borderRadius: 10,
                          padding: 15,
                          marginBottom: 15,
                        }}
                      >
                        <p>
                          <strong>
                            Lost item:
                          </strong>{" "}
                          {
                            lostItem?.item_name ||
                            "Legacy lost report"
                          }
                        </p>

                        <p>
                          <strong>
                            Found item:
                          </strong>{" "}
                          {
                            foundItem?.item_name ||
                            "Found item"
                          }
                        </p>

                        <p>
                          <strong>
                            Claimant:
                          </strong>{" "}
                          {
                            claim.claimant_email
                          }
                        </p>

                        <p>
                          <strong>
                            Finder/reporter:
                          </strong>{" "}
                          {
                            foundItem?.user_email ||
                            "Unknown"
                          }
                        </p>

                        <p>
                          <strong>
                            Claim message:
                          </strong>{" "}
                          {
                            claim.claim_message
                          }
                        </p>

                        <p>
                          <strong>
                            Status:
                          </strong>{" "}
                          {claim.status}
                        </p>

                        <p>
                          <strong>
                            Item status:
                          </strong>{" "}
                          {(
                            foundItem?.status ||
                            "available"
                          ).toUpperCase()}
                        </p>

                        {claim.created_at && (
                          <p>
                            <strong>
                              Submitted:
                            </strong>{" "}
                            {new Date(
                              claim.created_at
                            ).toLocaleString()}
                          </p>
                        )}

                        {claim.status ===
                          "pending" && (
                          <>
                            <button
                              onClick={() =>
                                updateClaimStatus(
                                  claim.id,
                                  "approved"
                                )
                              }
                              style={{
                                marginRight: 10,
                              }}
                            >
                              Approve Claim
                            </button>

                            <button
                              onClick={() =>
                                updateClaimStatus(
                                  claim.id,
                                  "rejected"
                                )
                              }
                            >
                              Reject Claim
                            </button>
                          </>
                        )}

                        {claim.status ===
                          "approved" &&
                          foundItem?.status ===
                            "claimed" && (
                            <button
                              onClick={() =>
                                markFoundItemReturned(
                                  foundItem.id
                                )
                              }
                            >
                              ✅ Mark as Returned
                            </button>
                          )}
                      </div>
                    );
                  }
                )
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
      <h1>
        🎒 BackToYou
      </h1>

      <h2>
        {isLogin
          ? "Login"
          : "Create Account"}
      </h2>

      {!isLogin && (
        <input
          type="text"
          placeholder="Enter Name"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          style={{
            display: "block",
            marginBottom: 15,
            padding: 10,
            width: "100%",
          }}
        />
      )}

      <input
        type="email"
        placeholder="Enter Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
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
        onChange={(e) =>
          setPassword(
            e.target.value
          )
        }
        style={{
          display: "block",
          marginBottom: 15,
          padding: 10,
          width: "100%",
        }}
      />

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
        onClick={() =>
          setIsLogin(!isLogin)
        }
      >
        {isLogin
          ? "Create New Account"
          : "Already have an account? Login"}
      </button>

      {!isLogin && (
        <>
          <br />
          <br />

          <button
            onClick={saveProfile}
          >
            Save Profile
          </button>
        </>
      )}
    </div>
  );
}