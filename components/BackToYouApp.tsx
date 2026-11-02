"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  canMarkReturned,
  canProcessClaim,
  canSubmitClaim,
  getClaimMessageError,
  getEmailError,
  getTextError,
  isAdminRole,
  MAX_CLAIM_LENGTH,
  MAX_TEXT_LENGTH,
  validateImageFile,
} from "@/lib/workflow";

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
  finder_email: string | null;
  finder_phone: string | null;
  item_status: "claimed" | "returned";
};

type ContactPreferenceValues = {
  phone: string | null;
  contact_email_enabled: boolean;
  contact_phone_enabled: boolean;
};

type EditableReport = {
  type: "lost" | "found";
  item: Item;
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
    .filter(
      (foundItem) =>
        foundItem.status !== "returned" &&
        Boolean(foundItem.user_email) &&
        foundItem.user_email?.toLowerCase() !== lostItem.user_email?.toLowerCase()
    )
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

export type BackToYouView =
  | "home"
  | "browse"
  | "report-lost"
  | "report-found"
  | "matches"
  | "my-reports"
  | "claims"
  | "profile"
  | "admin";

type BackToYouAppProps = {
  initialView?: BackToYouView;
  authMode?: "login" | "signup";
  forceAuth?: boolean;
};

export default function BackToYouApp({
  initialView = "home",
  authMode = "signup",
  forceAuth = false,
}: BackToYouAppProps) {
  const router = useRouter();
  const routeIntro: Record<BackToYouView, { eyebrow: string; title: string; description: string }> = {
    home: {
      eyebrow: "CAMPUS RECOVERY NETWORK",
      title: "",
      description: "",
    },
    browse: {
      eyebrow: "DISCOVER",
      title: "Browse reported items",
      description: "Search real lost and found reports from across your campus.",
    },
    "report-lost": {
      eyebrow: "REPORT LOST",
      title: "Start a recovery",
      description: "Tell us what went missing and where you last saw it.",
    },
    "report-found": {
      eyebrow: "REPORT FOUND",
      title: "Help something get home",
      description: "Share what you found so its owner has a way back.",
    },
    matches: {
      eyebrow: "POSSIBLE MATCHES",
      title: "Follow the signal",
      description: "Compare your reports with real found items using BackToYou's rule-based matching.",
    },
    "my-reports": {
      eyebrow: "YOUR RECOVERY WORKSPACE",
      title: "My reports",
      description: "Keep track of reports, matches, claims, and contact preferences.",
    },
    claims: {
      eyebrow: "CLAIMS",
      title: "Move with care",
      description: "Review claim status and approved ways to contact the other person.",
    },
    profile: {
      eyebrow: "PROFILE & SETTINGS",
      title: "Your recovery workspace",
      description: "Manage your account, reports, possible matches, claims, and contact preferences.",
    },
    admin: {
      eyebrow: "BACKTOYOU ADMIN",
      title: "Operations",
      description: "Review reports and claims while keeping the recovery network moving.",
    },
  };
  // =========================
  // AUTH / USER STATES
  // =========================

  const [isLogin, setIsLogin] = useState(authMode === "login");
  const [loggedIn, setLoggedIn] = useState(false);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [savingProfileName, setSavingProfileName] = useState(false);

  const [role, setRole] = useState("user");

  // =========================
  // LOST ITEM STATES
  // =========================

  const [showLostForm, setShowLostForm] = useState(initialView === "report-lost");

  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const [lostImage, setLostImage] = useState<File | null>(null);
  const [lostImagePreview, setLostImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lostFormError, setLostFormError] = useState("");

  // =========================
  // FOUND ITEM STATES
  // =========================

  const [showFoundForm, setShowFoundForm] = useState(initialView === "report-found");

  const [foundItemName, setFoundItemName] = useState("");
  const [foundDescription, setFoundDescription] = useState("");
  const [foundLocation, setFoundLocation] = useState("");

  const [foundImage, setFoundImage] = useState<File | null>(null);
  const [foundImagePreview, setFoundImagePreview] = useState("");
  const [uploadingFoundImage, setUploadingFoundImage] =
    useState(false);
  const [foundFormError, setFoundFormError] = useState("");

  // =========================
  // BROWSE ITEMS STATES
  // =========================

  const [showBrowse, setShowBrowse] = useState(initialView === "browse");

  const [lostItems, setLostItems] = useState<Item[]>([]);
  const [foundItems, setFoundItems] = useState<Item[]>([]);

  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");
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

  const [showMyReports, setShowMyReports] = useState(
    initialView === "my-reports" || initialView === "matches" || initialView === "claims" || initialView === "profile"
  );

  const [myFoundItems, setMyFoundItems] = useState<Item[]>([]);
  const [allFoundItems, setAllFoundItems] = useState<Item[]>([]);
  const [myClaims, setMyClaims] = useState<Claim[]>([]);
  const [editingReport, setEditingReport] = useState<EditableReport | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [reportEditError, setReportEditError] = useState("");
  const [savingReportEdit, setSavingReportEdit] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);
  const [myReportsLoading, setMyReportsLoading] = useState(false);
  const [myReportsError, setMyReportsError] = useState("");

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
    savingContactPreferences,
    setSavingContactPreferences,
  ] = useState(false);

  const [claimItem, setClaimItem] =
    useState<Item | null>(null);

  const [claimLostItem, setClaimLostItem] =
    useState<Item | null>(null);

  const [claimMessage, setClaimMessage] = useState("");
  const [claimFormError, setClaimFormError] = useState("");
  const [claimSuccessMessage, setClaimSuccessMessage] = useState("");
  const [submittingClaim, setSubmittingClaim] =
    useState(false);

  // =========================
  // ADMIN STATES
  // =========================

  const [showAdmin, setShowAdmin] = useState(initialView === "admin");

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
    const emailError = getEmailError(email);
    if (emailError || password.length < 8) {
      setAuthError(emailError || "Password must be at least 8 characters.");
      return;
    }

    setAuthError("");
    setAuthSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          name: name.trim() || "User",
        },
      },
    });

    if (error) {
      console.error("Signup failed:", error);
      setAuthError("Could not create your account. Check your details and try again.");
    } else {
      setAuthError("Signup successful. Check your email if confirmation is enabled.");
      router.push("/login");
    }
    setAuthSubmitting(false);
  }

  // =========================
  // LOGIN
  // =========================

  async function login() {
    const emailError = getEmailError(email);
    if (emailError || !password) {
      setAuthError(emailError || "Password is required.");
      return;
    }

    setAuthError("");
    setAuthSubmitting(true);
    const { data: signInData, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (error) {
      console.error("Login failed:", error);
      setAuthError("Could not sign in. Check your email and password.");
      setAuthSubmitting(false);
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

    } else {
      setEmail(authenticatedEmail || "");
      setName("User");
      setRole("user");
    }

    setLoggedIn(true);
    setAuthStatus("authenticated");
    router.push("/");
    setAuthSubmitting(false);
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

  const email = user.email.toLowerCase();

  // First, check whether the profile already exists.
  const {
    data: existingProfile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id, name, email, role, phone, contact_email_enabled, contact_phone_enabled"
    )
    .eq("email", email)
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

  // Try to create the profile.
  const {
    data: createdProfile,
    error: createError,
  } = await supabase
    .from("profiles")
    .insert([
      {
        name: metadataName || "User",
        email,
        role: "user",
        phone: contactPreferences?.phone ?? null,
        contact_email_enabled:
          contactPreferences?.contact_email_enabled ?? true,
        contact_phone_enabled:
          contactPreferences?.contact_phone_enabled ?? false,
      },
    ])
    .select(
      "id, name, email, role, phone, contact_email_enabled, contact_phone_enabled"
    )
    .single();

  // Profile was created successfully.
  if (createdProfile) {
    return createdProfile;
  }

  // Another request may have created the profile at the same time.
  // PostgreSQL error 23505 = unique constraint violation.
  if (createError?.code === "23505") {
    const {
      data: profileAfterConflict,
      error: retryError,
    } = await supabase
      .from("profiles")
      .select(
        "id, name, email, role, phone, contact_email_enabled, contact_phone_enabled"
      )
      .eq("email", email)
      .maybeSingle();

    if (retryError) {
      console.error(
        "Could not load profile after duplicate creation was prevented:",
        retryError
      );

      return null;
    }

    return profileAfterConflict;
  }

  console.error(
    "Could not create the authenticated user profile:",
    createError
  );

  return null;
}

  async function saveProfileName() {
    const profile = await ensureCurrentUserProfile();
    const profileName = name.trim();

    if (!profile || !profileName || profileName.length > 100) {
      alert("Enter a name between 1 and 100 characters.");
      return;
    }

    setSavingProfileName(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: profileName })
      .eq("id", profile.id);

    if (error) {
      console.error("Profile name update failed:", error);
      alert("Could not save your profile name. Please try again.");
    } else {
      setName(profileName);
      alert("Profile saved.");
    }
    setSavingProfileName(false);
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
      "Could not save contact preferences. Please try again."
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

    const imageError = validateImageFile(file);
    if (imageError) {
      setLostFormError(imageError);
      event.target.value = "";
      setLostImage(null);
      setLostImagePreview("");
      return;
    }

    setLostFormError("");
    setLostImage(file);
    setLostImagePreview(URL.createObjectURL(file));
  }

  function handleFoundImageChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setFoundImage(null);
      return;
    }

    const imageError = validateImageFile(file);
    if (imageError) {
      setFoundFormError(imageError);
      event.target.value = "";
      setFoundImage(null);
      setFoundImagePreview("");
      return;
    }

    setFoundFormError("");
    setFoundImage(file);
    setFoundImagePreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    return () => {
      if (lostImagePreview) {
        URL.revokeObjectURL(lostImagePreview);
      }
    };
  }, [lostImagePreview]);

  useEffect(() => {
    return () => {
      if (foundImagePreview) {
        URL.revokeObjectURL(foundImagePreview);
      }
    };
  }, [foundImagePreview]);

  // =========================
  // REPORT LOST ITEM
  // =========================

  async function reportLostItem() {
    const validationError =
      getTextError(itemName, "Item name") ||
      getTextError(description, "Description") ||
      getTextError(location, "Location");

    if (validationError) {
      setLostFormError(validationError);
      return;
    }

    const currentProfile = await ensureCurrentUserProfile();
    const reportEmail = currentProfile?.email || email.trim().toLowerCase();
    if (!reportEmail) {
      setLostFormError("Your session could not be confirmed. Please sign in again.");
      return;
    }

    setLostFormError("");
    setUploadingImage(true);

    let imageUrl: string | null = null;
    let uploadedFilePath: string | null = null;

    if (lostImage) {
      const safeFileName = lostImage.name.replace(
        /[^a-zA-Z0-9.-]/g,
        "_"
      );

      const filePath = `${crypto.randomUUID()}-${safeFileName}`;
      uploadedFilePath = filePath;

      const { error: uploadError } =
        await supabase.storage
          .from("item-images")
          .upload(filePath, lostImage);

      if (uploadError) {
        console.error("Lost item image upload failed:", uploadError);
        setLostFormError("Image upload failed. Please try again.");
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
          item_name: itemName.trim(),
          description: description.trim(),
          location: location.trim(),
          user_email: reportEmail,
          image_url: imageUrl,
        },
      ]);

    if (error) {
      console.error("Lost item report creation failed:", error);
      setLostFormError("Could not save your lost-item report. Please try again.");
      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from("item-images")
          .remove([uploadedFilePath]);
        if (cleanupError) {
          console.error("Lost item image cleanup failed:", cleanupError);
          setLostFormError(
            "The report could not be saved, and its uploaded image could not be cleaned up. Please contact support."
          );
        }
      }
      setUploadingImage(false);
      return;
    }

    setItemName("");
    setDescription("");
    setLocation("");
    setLostImage(null);
    setLostImagePreview("");

    setShowLostForm(false);
    setUploadingImage(false);

    if (showBrowse) {
      loadBrowseItems();
    }

    void loadMyReports();
  }

  // =========================
  // REPORT FOUND ITEM
  // =========================

  async function reportFoundItem() {
    const validationError =
      getTextError(foundItemName, "Item name") ||
      getTextError(foundDescription, "Description") ||
      getTextError(foundLocation, "Location");

    if (validationError) {
      setFoundFormError(validationError);
      return;
    }

    const currentProfile = await ensureCurrentUserProfile();
    const reportEmail = currentProfile?.email || email.trim().toLowerCase();
    if (!reportEmail) {
      setFoundFormError("Your session could not be confirmed. Please sign in again.");
      return;
    }

    setFoundFormError("");
    setUploadingFoundImage(true);

    let imageUrl: string | null = null;
    let uploadedFilePath: string | null = null;

    if (foundImage) {
      const safeFileName =
        foundImage.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        );

      const filePath = `${crypto.randomUUID()}-${safeFileName}`;
      uploadedFilePath = filePath;

      const { error: uploadError } =
        await supabase.storage
          .from("item-images")
          .upload(filePath, foundImage);

      if (uploadError) {
        console.error("Found item image upload failed:", uploadError);
        setFoundFormError("Image upload failed. Please try again.");
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
          item_name: foundItemName.trim(),
          description: foundDescription.trim(),
          location: foundLocation.trim(),
          user_email: reportEmail,
          image_url: imageUrl,
        },
      ]);

    if (error) {
      console.error("Found item report creation failed:", error);
      setFoundFormError("Could not save your found-item report. Please try again.");
      if (uploadedFilePath) {
        const { error: cleanupError } = await supabase.storage
          .from("item-images")
          .remove([uploadedFilePath]);
        if (cleanupError) {
          console.error("Found item image cleanup failed:", cleanupError);
          setFoundFormError(
            "The report could not be saved, and its uploaded image could not be cleaned up. Please contact support."
          );
        }
      }
      setUploadingFoundImage(false);
      return;
    }

    setFoundItemName("");
    setFoundDescription("");
    setFoundLocation("");
    setFoundImage(null);
    setFoundImagePreview("");

    setShowFoundForm(false);
    setUploadingFoundImage(false);

    if (showBrowse) {
      loadBrowseItems();
    }

    void loadMyReports();

    if (showAdmin) {
      loadAdminData();
    }
  }

  // =========================
  // BROWSE ITEMS
  // =========================

  async function loadBrowseItems() {
    setBrowseLoading(true);
    setBrowseError("");

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
        "id, item_name, description, location, image_url, created_at, status, user_email"
      )
      .order("id", {
        ascending: false,
      });

    if (lostError) {
      console.error("Lost items query failed:", lostError);
    }

    if (foundError) {
      console.error("Found items query failed:", foundError);
    }

    if (lostError || foundError) {
      setBrowseError("Some items could not be loaded. Please try again.");
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
    setClaimSuccessMessage("");
  }

  function openBrowseClaimForm(item: Item) {
    if (item.status && item.status !== "available") {
      setBrowseError("This found item is no longer available for new claims.");
      return;
    }

    const claimantEmail = email.trim().toLowerCase();
    const ownedLostItems = lostItems.filter(
      (lostItem) => lostItem.user_email?.toLowerCase() === claimantEmail
    );

    setClaimItem(item);
    setClaimLostItem(ownedLostItems[0] || null);
    setClaimMessage("");
    setClaimSuccessMessage("");
    setClaimFormError(
      ownedLostItems.length === 0
        ? "Create a lost-item report before claiming a found item."
        : ""
    );
  }

  function cancelClaim() {
    setClaimItem(null);
    setClaimLostItem(null);
    setClaimMessage("");
    setClaimFormError("");
  }

  async function submitClaim() {
    const trimmedMessage =
      claimMessage.trim();

    if (!claimItem || !claimLostItem) {
      setClaimFormError("Please select a lost report before submitting.");
      return;
    }

    const claimMessageError = getClaimMessageError(trimmedMessage);
    if (claimMessageError) {
      setClaimFormError(claimMessageError);
      return;
    }

    const currentProfile = await ensureCurrentUserProfile();
    const claimantEmail = currentProfile?.email || email.trim().toLowerCase();
    if (!claimantEmail) {
      setClaimFormError("Your session could not be confirmed. Please sign in again.");
      return;
    }

    setClaimFormError("");
    setSubmittingClaim(true);

    const {
      data: pendingClaim,
      error: pendingClaimError,
    } = await supabase
      .from("claims")
      .select("id")
      .eq("item_id", claimItem.id)
      .eq("claimant_email", claimantEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingClaimError) {
      console.error("Pending claim query failed:", pendingClaimError);
      setClaimFormError("Could not check existing claims. Please try again.");
      setSubmittingClaim(false);
      return;
    }

    if (!canSubmitClaim(claimItem.status, Boolean(pendingClaim))) {
      if (claimItem.status !== "available") {
        setClaimFormError(
          "This found item is no longer available for new claims."
        );
        setSubmittingClaim(false);
        return;
      }
      setClaimFormError("You already have a pending claim for this item.");
      setSubmittingClaim(false);
      return;
    }

    const { error } =
      await supabase.from("claims").insert([
        {
          item_id: claimItem.id,
          lost_item_id: claimLostItem.id,
          claimant_email: claimantEmail,
          claim_message: trimmedMessage,
          status: "pending",
        },
      ]);

    if (error) {
      if (error.code === "23505") {
        setClaimFormError("You already have a pending claim for this item.");
      } else {
        console.error("Claim submission failed:", error);
        setClaimFormError("Could not submit your claim. Please try again.");
      }

      setSubmittingClaim(false);
      return;
    }

    cancelClaim();
    setClaimSuccessMessage("Claim submitted successfully. It is pending review.");
    setSubmittingClaim(false);

    if (showMyReports) {
      loadMyReports();
    }
  }

  // =========================
  // MY REPORTS
  // =========================

  async function loadMyReports(knownEmail?: string) {
    setMyReportsLoading(true);
    setMyReportsError("");

    const profile = await ensureCurrentUserProfile();
    const currentEmail = profile?.email || knownEmail?.trim().toLowerCase() || email.trim().toLowerCase();

    if (!currentEmail) {
      setMyReportsError("Your session could not be confirmed. Please sign in again.");
      setMyReportsLoading(false);
      return;
    }

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
      .eq("user_email", currentEmail)
      .order("id", {
        ascending: false,
      });

    const {
      data: foundData,
      error: foundError,
    } = await supabase
      .from("found_items")
      .select(
        "id, item_name, description, location, image_url, created_at, status, user_email"
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
      .eq("user_email", currentEmail)
      .order("id", {
        ascending: false,
      });

    const {
      data: claimsData,
      error: claimsError,
    } = await supabase
      .from("claims")
      .select("*")
      .eq("claimant_email", currentEmail)
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
      console.error("My lost reports query failed:", lostError);
    }

    if (foundError) {
      console.error("All found reports query failed:", foundError);
    }

    if (myFoundError) {
      console.error("My found reports query failed:", myFoundError);
    }

    if (claimsError) {
      console.error("My claims query failed:", claimsError);
    }

    if (lostError || foundError || myFoundError || claimsError) {
      setMyReportsError("Could not load your recovery data. Please try again.");
    }

    if (contactError) {
      console.error("Approved contacts query failed:", contactError);

      setApprovedContactsError(
        "Could not load approved contact information. Please try again."
      );
    } else {
      setApprovedContactsError("");
    }

    if (lostData) {
      setLostItems(lostData);
    }

    if (foundData) {
      setAllFoundItems(foundData);
    }

    if (myFoundData) {
      setMyFoundItems(myFoundData);
    }

    if (claimsData) {
      setMyClaims(claimsData);
    }

    setApprovedClaimContacts(
      contactData || []
    );
    setMyReportsLoading(false);
  }

  function beginReportEdit(type: "lost" | "found", item: Item) {
    if (type === "found" && item.status !== "available") {
      alert("Claimed or returned found items cannot be edited.");
      return;
    }

    setEditingReport({ type, item });
    setEditItemName(item.item_name);
    setEditDescription(item.description);
    setEditLocation(item.location);
    setReportEditError("");
  }

  function cancelReportEdit() {
    setEditingReport(null);
    setReportEditError("");
  }

  async function saveReportEdit() {
    if (!editingReport || savingReportEdit) {
      return;
    }

    const validationError =
      getTextError(editItemName, "Item name") ||
      getTextError(editDescription, "Description") ||
      getTextError(editLocation, "Location");

    if (validationError) {
      setReportEditError(validationError);
      return;
    }

    const profile = await ensureCurrentUserProfile();
    if (!profile || profile.email.toLowerCase() !== email.toLowerCase()) {
      setReportEditError("Please sign in again before editing this report.");
      return;
    }

    setSavingReportEdit(true);
    setReportEditError("");

    const table = editingReport.type === "lost" ? "lost_items" : "found_items";
    const { data, error } = await supabase
      .from(table)
      .update({
        item_name: editItemName.trim(),
        description: editDescription.trim(),
        location: editLocation.trim(),
      })
      .eq("id", editingReport.item.id)
      .eq("user_email", profile.email)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Report update failed:", error || "No owned report was updated.");
      setReportEditError("Could not update this report. Please try again.");
      setSavingReportEdit(false);
      return;
    }

    setEditingReport(null);
    setSavingReportEdit(false);
    await loadMyReports();
  }

  async function deleteOwnReport(type: "lost" | "found", item: Item) {
    if (deletingReportId !== null) {
      return;
    }

    if (type === "found" && item.status !== "available") {
      alert("Claimed or returned found items cannot be deleted.");
      return;
    }

    if (
      type === "lost" &&
      myClaims.some((claim) => claim.lost_item_id === item.id)
    ) {
      alert("A lost report connected to a claim cannot be deleted.");
      return;
    }

    if (!confirm(`Delete the ${type} report for "${item.item_name}"?`)) {
      return;
    }

    const profile = await ensureCurrentUserProfile();
    if (!profile || profile.email.toLowerCase() !== email.toLowerCase()) {
      alert("Please sign in again before deleting this report.");
      return;
    }

    setDeletingReportId(item.id);
    const table = type === "lost" ? "lost_items" : "found_items";
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq("id", item.id)
      .eq("user_email", profile.email)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Report deletion failed:", error || "No owned report was deleted.");
      alert("Could not delete this report. Please try again.");
      setDeletingReportId(null);
      return;
    }

    setDeletingReportId(null);
    await loadMyReports();
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
    const currentProfile = await ensureCurrentUserProfile();

    if (currentProfile?.role !== "admin") {
      setShowAdmin(false);
      setProfiles([]);
      setAdminLostItems([]);
      setAdminFoundItems([]);
      setAdminClaims([]);
      return;
    }

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
      console.error("Admin profiles query failed:", profileError);
    }

    if (lostError) {
      console.error("Admin lost reports query failed:", lostError);
    }

    if (foundError) {
      console.error("Admin found reports query failed:", foundError);
    }

    if (claimsError) {
      console.error("Admin claims query failed:", claimsError);
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
    if (role !== "admin") {
      return;
    }

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
    const currentProfile = await ensureCurrentUserProfile();

    if (currentProfile?.role !== "admin") {
      return;
    }

    const claim = adminClaims.find((item) => item.id === claimId);
    if (!claim || !canProcessClaim(claim.status)) {
      alert("This claim has already been processed.");
      return;
    }

    const { error } =
      await supabase
        .from("claims")
        .update({ status })
        .eq("id", claimId);

    if (error) {
      console.error("Claim status update failed:", error);
      alert("Could not update the claim. Please try again.");
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
    const currentProfile = await ensureCurrentUserProfile();

    if (currentProfile?.role !== "admin") {
      return;
    }

    const item = adminFoundItems.find((candidate) => candidate.id === itemId);
    if (!item || !canMarkReturned(item.status)) {
      alert("Only claimed items can be marked as returned.");
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
      console.error("Found item status update failed:", error);
      alert("Could not update the item status. Please try again.");
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
    if (role !== "admin") {
      return;
    }

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
      console.error("Lost item deletion failed:", error);
      alert("Could not delete the lost item. Please try again.");
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
    if (role !== "admin") {
      return;
    }

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
      console.error("Found item deletion failed:", error);
      alert("Could not delete the found item. Please try again.");
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
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout failed:", error);
      alert("Could not sign out. Please try again.");
      return;
    }

    setLoggedIn(false);
    setAuthStatus("unauthenticated");

    setName("");
    setEmail("");
    setPassword("");
    setRole("user");

    setContactPhone("");
    setContactEmailEnabled(true);
    setContactPhoneEnabled(false);

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
    router.push("/login");
  }

  // =========================
  // CHECK EXISTING SESSION
  // =========================

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setLoggedIn(false);
        setAuthStatus("unauthenticated");
      }
    });

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

        } else {
          setName("User");
          setRole("user");
        }

        setLoggedIn(true);
        setAuthStatus("authenticated");
        if (forceAuth) {
          router.push("/");
        } else if (initialView === "browse") {
          loadBrowseItems();
        } else if (
          initialView === "my-reports" ||
          initialView === "matches" ||
          initialView === "claims" ||
          initialView === "profile"
        ) {
          loadMyReports(userEmail);
        } else if (initialView === "admin") {
          loadAdminData();
        }
      } else {
        setAuthStatus("unauthenticated");
      }
    }

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // =========================
  // LOGGED IN SCREEN
  // =========================

  if (authStatus === "loading") {
    return (
      <main className="auth-loading" aria-live="polite">
        <img src="/backtoyou-logo.png" alt="" />
        <p>Restoring your BackToYou session...</p>
      </main>
    );
  }

  if (loggedIn && authStatus === "authenticated" && !forceAuth) {
    return (
      <div
        className="app-shell"
        data-view={initialView}
        style={{
          padding: 40,
          maxWidth: 1000,
          margin: "0 auto",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <header className="dashboard-header">
          <Link className="brand-lockup" href="/" aria-label="BackToYou home">
            <img src="/backtoyou-logo.png" alt="BackToYou logo" />
            <span>
              <strong>BackToYou</strong>
              <small>Campus recovery network</small>
            </span>
          </Link>
          <nav className="product-nav" aria-label="Primary navigation">
            <Link className={initialView === "home" ? "is-active" : ""} href="/">Home</Link>
            <Link className={initialView === "browse" ? "is-active" : ""} href="/browse">Browse</Link>
            <Link className={initialView === "report-lost" ? "is-active" : ""} href="/report-lost">Report Lost</Link>
            <Link className={initialView === "report-found" ? "is-active" : ""} href="/report-found">Report Found</Link>
            <Link className={initialView === "my-reports" ? "is-active" : ""} href="/my-reports">My Reports</Link>
            <Link className={initialView === "profile" ? "is-active" : ""} href="/profile">Profile</Link>
            {isAdminRole(role) && (
              <Link className={initialView === "admin" ? "is-active" : ""} href="/admin">Admin Portal</Link>
            )}
          </nav>
          <div className="header-account">
            <span className="avatar">{(name || "U").charAt(0).toUpperCase()}</span>
            <span className="account-copy">
              <strong>{name || "User"}</strong>
              <small>{email}</small>
            </span>
            <button className="account-logout" onClick={logout}>Log out</button>
          </div>
        </header>

        {initialView !== "home" && (
          <section className={`route-page-intro route-page-intro-${initialView}`} aria-labelledby="route-page-title">
            <p className="eyebrow">{routeIntro[initialView].eyebrow}</p>
            <h1 id="route-page-title">{routeIntro[initialView].title}</h1>
            <p>{routeIntro[initialView].description}</p>
          </section>
        )}

        {!showLostForm && !showFoundForm && !showBrowse && !showMyReports && !showAdmin && (
          <section className="dashboard-hero">
            <div className="hero-copy">
              <p className="eyebrow">CAMPUS RECOVERY NETWORK</p>
              <h2>Lost something?<br /><em>Let&apos;s get it BackToYou.</em></h2>
              <p>
                Report lost and found belongings, discover possible matches, and
                connect through a safer claim process.
              </p>
              <div className="hero-actions">
                <button className="button-primary" onClick={() => router.push("/report-lost")}>Report Lost Item <span aria-hidden="true">↗</span></button>
                <button className="button-quiet" onClick={() => router.push("/browse")}>Browse Found Items</button>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-orbit hero-orbit-one" />
              <div className="hero-orbit hero-orbit-two" />
              <img src="/backtoyou-logo.png" alt="" />
              <span className="hero-note hero-note-top">FIND WHAT MATTERS</span>
              <span className="hero-note hero-note-bottom">SAFE CLAIMS / REAL PEOPLE</span>
            </div>
          </section>
        )}

        <nav className="quick-actions" aria-label="Main actions">

        {/* ADMIN */}

        {isAdminRole(role) && (
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
          className="action-chip action-chip-lost"
          onClick={() => router.push("/report-lost")}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          <span className="action-chip-label">I lost something</span>
          <span className="action-chip-detail">Create a report with the item&apos;s details</span>
          <span aria-hidden="true">↗</span>
        </button>

        {showLostForm && (
          <div
            className="surface-card form-card"
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
              aria-label="Lost item name"
              placeholder="Item Name"
              maxLength={MAX_TEXT_LENGTH}
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
              aria-label="Lost item description"
              placeholder="Description"
              maxLength={MAX_TEXT_LENGTH}
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
              aria-label="Where the item was lost"
              placeholder="Location Lost"
              maxLength={MAX_TEXT_LENGTH}
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
                aria-label="Upload an image of the lost item"
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
                    src={lostImagePreview}
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

            {lostFormError && (
              <p role="alert" className="form-error">{lostFormError}</p>
            )}
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
          className="action-chip action-chip-found"
          onClick={() => router.push("/report-found")}
          style={{
            display: "block",
            marginBottom: 20,
            fontSize: 18,
            padding: 10,
          }}
        >
          <span className="action-chip-label">I found something</span>
          <span className="action-chip-detail">Help return an item by sharing what you found</span>
          <span aria-hidden="true">↗</span>
        </button>

        {showFoundForm && (
          <div
            className="surface-card form-card"
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
              aria-label="Found item name"
              placeholder="Item Name"
              maxLength={MAX_TEXT_LENGTH}
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
              aria-label="Found item description"
              placeholder="Description"
              maxLength={MAX_TEXT_LENGTH}
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
              aria-label="Where the item was found"
              placeholder="Location Found"
              maxLength={MAX_TEXT_LENGTH}
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
                aria-label="Upload an image of the found item"
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
                    src={foundImagePreview}
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

            {foundFormError && (
              <p role="alert" className="form-error">{foundFormError}</p>
            )}
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
            className="content-section browse-section"
            style={{
              marginTop: 20,
              marginBottom: 40,
            }}
          >
            <h2>
              🔍 Browse Items
            </h2>

            <div
              className="browse-toolbar"
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

            {browseError && (
              <p role="alert" className="form-error">{browseError}</p>
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
                            <Link href={`/reports/lost/${item.id}`}>
                              📦 {item.item_name}
                            </Link>
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
                            <Link href={`/reports/found/${item.id}`}>
                              🎁 {item.item_name}
                            </Link>
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
                            <>
                              <p
                              style={{
                                fontSize: 13,
                                color: "#666",
                              }}
                              >
                                Available to claim through your recovery workspace.
                              </p>
                              <button
                                type="button"
                                onClick={() => openBrowseClaimForm(item)}
                              >
                                Claim Item
                              </button>
                            </>
                          )}
                        </div>
                      )
                    )}
              </>
            )}

            {claimSuccessMessage && (
              <p role="status" className="success-message">{claimSuccessMessage}</p>
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
                {lostItems.filter(
                  (lostItem) => lostItem.user_email?.toLowerCase() === email.trim().toLowerCase()
                ).length > 0 && (
                  <label>
                    Select the lost report this claim relates to
                    <select
                      value={claimLostItem?.id ?? ""}
                      onChange={(event) => {
                        const selectedLostItem = lostItems.find(
                          (lostItem) => lostItem.id === Number(event.target.value)
                        );
                        setClaimLostItem(selectedLostItem || null);
                      }}
                    >
                      {lostItems
                        .filter(
                          (lostItem) => lostItem.user_email?.toLowerCase() === email.trim().toLowerCase()
                        )
                        .map((lostItem) => (
                          <option key={lostItem.id} value={lostItem.id}>
                            {lostItem.item_name} · {lostItem.location}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

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
                  maxLength={MAX_CLAIM_LENGTH}
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

                {claimFormError && (
                  <p role="alert" className="form-error">{claimFormError}</p>
                )}
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
        </nav>

        {!showLostForm && !showFoundForm && !showBrowse && !showMyReports && !showAdmin && (
          <>
            <section className="how-it-works">
              <div>
                <span className="step-number">01</span>
                <h3>Tell us what happened</h3>
                <p>Share the item details and where it was lost or found.</p>
              </div>
              <div>
                <span className="step-number">02</span>
                <h3>Browse & compare</h3>
                <p>Explore real reports and review possible matches.</p>
              </div>
              <div>
                <span className="step-number">03</span>
                <h3>Make a safe claim</h3>
                <p>Submit a claim and connect after admin approval.</p>
              </div>
            </section>
            <section className="trust-strip" aria-label="Claim privacy">
              <span className="trust-mark" aria-hidden="true">✦</span>
              <div>
                <p className="eyebrow">A MORE CONSIDERED WAY TO RECONNECT</p>
                <p>Claims are reviewed before contact details are revealed. Approved contact methods follow each user&apos;s preferences.</p>
              </div>
            </section>
            <footer className="site-footer">
              <Link className="footer-brand" href="/" aria-label="BackToYou home">
                <img src="/backtoyou-logo.png" alt="BackToYou logo" />
                <span>BackToYou</span>
              </Link>
              <span>Lost & found, brought back to people.</span>
              <span>© {new Date().getFullYear()} BackToYou</span>
            </footer>
          </>
        )}

        {showMyReports && (initialView === "my-reports" || initialView === "profile") && (
          <div
            className="content-section reports-section"
            style={{
              marginBottom: 40,
            }}
          >
            <h2>My Reports</h2>
            {myReportsLoading && <p className="muted-copy">Loading your recovery data...</p>}
            {myReportsError && <p role="alert" className="form-error">{myReportsError}</p>}

            <h3>
              📦 My Lost Reports
            </h3>

            {!myReportsError && lostItems.length ===
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

                      <div className="report-actions">
                        <button onClick={() => beginReportEdit("lost", item)}>
                          Edit report
                        </button>
                        <button
                          onClick={() => deleteOwnReport("lost", item)}
                          disabled={deletingReportId === item.id}
                        >
                          {deletingReportId === item.id ? "Deleting..." : "Delete report"}
                        </button>
                      </div>

                      {editingReport?.type === "lost" &&
                        editingReport.item.id === item.id && (
                          <div className="report-edit-form">
                            <input
                              value={editItemName}
                              maxLength={MAX_TEXT_LENGTH}
                              onChange={(event) => setEditItemName(event.target.value)}
                              aria-label="Lost item name"
                            />
                            <textarea
                              value={editDescription}
                              maxLength={MAX_TEXT_LENGTH}
                              onChange={(event) => setEditDescription(event.target.value)}
                              aria-label="Lost item description"
                            />
                            <input
                              value={editLocation}
                              maxLength={MAX_TEXT_LENGTH}
                              onChange={(event) => setEditLocation(event.target.value)}
                              aria-label="Lost item location"
                            />
                            {reportEditError && (
                              <p role="alert" className="form-error">{reportEditError}</p>
                            )}
                            <button onClick={saveReportEdit} disabled={savingReportEdit}>
                              {savingReportEdit ? "Saving..." : "Save changes"}
                            </button>
                            <button onClick={cancelReportEdit} disabled={savingReportEdit}>
                              Cancel
                            </button>
                          </div>
                        )}

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

            {!myReportsError && myFoundItems.length ===
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

                    <div className="report-actions">
                      <button onClick={() => beginReportEdit("found", item)}>
                        Edit report
                      </button>
                      <button
                        onClick={() => deleteOwnReport("found", item)}
                        disabled={deletingReportId === item.id}
                      >
                        {deletingReportId === item.id ? "Deleting..." : "Delete report"}
                      </button>
                    </div>

                    {editingReport?.type === "found" &&
                      editingReport.item.id === item.id && (
                        <div className="report-edit-form">
                          <input
                            value={editItemName}
                            maxLength={MAX_TEXT_LENGTH}
                            onChange={(event) => setEditItemName(event.target.value)}
                            aria-label="Found item name"
                          />
                          <textarea
                            value={editDescription}
                            maxLength={MAX_TEXT_LENGTH}
                            onChange={(event) => setEditDescription(event.target.value)}
                            aria-label="Found item description"
                          />
                          <input
                            value={editLocation}
                            maxLength={MAX_TEXT_LENGTH}
                            onChange={(event) => setEditLocation(event.target.value)}
                            aria-label="Found item location"
                          />
                          {reportEditError && (
                            <p role="alert" className="form-error">{reportEditError}</p>
                          )}
                          <button onClick={saveReportEdit} disabled={savingReportEdit}>
                            {savingReportEdit ? "Saving..." : "Save changes"}
                          </button>
                          <button onClick={cancelReportEdit} disabled={savingReportEdit}>
                            Cancel
                          </button>
                        </div>
                      )}
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

                  const hasSharedMethod =
                    Boolean(
                      otherEmail ||
                        otherPhone
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

                    </div>
                  );
                }
              )
            )}

            {/* MY CLAIMS */}

            <h3>
              My Claims
            </h3>

            {!myReportsError && myClaims.length ===
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

        {showMyReports && (initialView === "matches" || initialView === "profile") && (
          <section className="content-section view-section">
            <p className="eyebrow">MATCHES</p>
            <h2>Possible matches</h2>
            <p className="section-lede">
              Compare your lost reports with found items already reported on campus.
            </p>
            {myReportsError ? null : lostItems.length === 0 ? (
              <p className="empty-state">Create a lost-item report to see possible matches.</p>
            ) : (
              lostItems.map((item) => {
                const matches = getPossibleMatches(item, allFoundItems);
                return (
                  <article className="dashboard-card" key={`matches-${item.id}`}>
                    <div className="card-heading">
                      <div>
                        <span className="status-badge">{item.status || "open"}</span>
                        <h3>{item.item_name}</h3>
                      </div>
                      <span>{matches.length} match{matches.length === 1 ? "" : "es"}</span>
                    </div>
                    {matches.length > 0 ? (
                      <ul className="match-list">
                        {matches.map((match) => (
                          <li key={`${item.id}-${match.id}`}>
                            <strong>{match.item_name}</strong>
                            <span>{match.score}% match · {match.location || "Location not provided"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted-copy">No likely matches yet.</p>
                    )}
                  </article>
                );
              })
            )}
          </section>
        )}

        {showMyReports && initialView === "claims" && (
          <section className="content-section view-section">
            <p className="eyebrow">CLAIMS</p>
            <h2>Your claims</h2>
            <p className="section-lede">
              Track submitted claims and review contact details only after approval.
            </p>
            {myClaims.length === 0 ? (
              <p className="empty-state">You have not submitted any claims.</p>
            ) : (
              <div className="dashboard-grid">
                {myClaims.map((claim) => {
                  const foundItem = allFoundItems.find((item) => item.id === claim.item_id);
                  const lostItem = lostItems.find((item) => item.id === claim.lost_item_id);
                  return (
                    <article className="dashboard-card" key={`claim-view-${claim.id}`}>
                      <span className={`status-badge status-${claim.status}`}>{claim.status}</span>
                      <h3>{foundItem?.item_name || "Found item"}</h3>
                      <p>Matched to: {lostItem?.item_name || "Lost report"}</p>
                      <p className="muted-copy">{claim.claim_message}</p>
                      {claim.created_at && (
                        <small>Submitted {new Date(claim.created_at).toLocaleString()}</small>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {showMyReports && initialView === "profile" && (
          <section className="content-section view-section profile-view">
            <p className="eyebrow">PROFILE</p>
            <h2>Your profile</h2>
            <p className="section-lede">Keep your display name and contact preferences current.</p>
            <div className="dashboard-card profile-card">
              <label htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
              />
              <button type="button" className="primary-button" onClick={saveProfileName} disabled={savingProfileName}>
                {savingProfileName ? "Saving..." : "Save profile"}
              </button>
              <p className="muted-copy">{email}</p>
            </div>
          </section>
        )}

        {/* ADMIN DASHBOARD */}

        {showAdmin &&
          isAdminRole(role) && (
            <div
              className="content-section admin-section"
              style={{
                marginTop: 30,
                marginBottom: 40,
                padding: 20,
                border:
                  "2px solid #444",
                borderRadius: 10,
              }}
            >
              <aside className="admin-sidebar">
                <p className="eyebrow">BACKTOYOU ADMIN</p>
                <h2>Operations</h2>
                <p>Review activity, resolve claims, and keep the campus recovery network moving.</p>
                <div className="admin-nav-note">
                  <span className="status-dot status-dot-amber" />
                  {adminClaims.filter((claim) => claim.status === "pending").length} claims need review
                </div>
              </aside>
              <div className="admin-content">
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
    <div className="auth-shell">
      <section className="auth-brand-panel">
        <Link className="auth-logo" href="/" aria-label="BackToYou home">
          <img src="/backtoyou-logo.png" alt="BackToYou logo" />
        </Link>
        <p className="eyebrow">CAMPUS RECOVERY NETWORK</p>
        <h1>Somewhere between lost and found, there&apos;s a way back.</h1>
        <p>BackToYou helps people report, discover, and reconnect with the belongings that matter.</p>
        <div className="auth-brand-line"><span /> Built for real recoveries</div>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-heading">
        <p className="eyebrow">WELCOME BACK</p>
        <h2 id="auth-heading">{isLogin ? "Log in to BackToYou" : "Create your account"}</h2>
        <p className="auth-intro">
          {isLogin ? "Pick up where you left off." : "Start helping belongings find their way home."}
        </p>
        {!isLogin && (
          <label>
            Name
            <input type="text" maxLength={100} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label>
          Email
          <input type="email" aria-label="Email address" maxLength={254} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" aria-label="Password" minLength={8} placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {authError && <p role="alert" className="form-error">{authError}</p>}
        <button className="auth-submit" onClick={isLogin ? login : signUp} disabled={authSubmitting}>
          {authSubmitting ? "Please wait..." : isLogin ? "Log in" : "Create account"} <span aria-hidden="true">↗</span>
        </button>
        <button className="auth-toggle" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Create a new account" : "Already have an account? Log in"}
        </button>
      </section>
    </div>
  );
}
