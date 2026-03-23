import { useState } from "react";
import { useAuth } from '../lib/AuthContext';
import { useAppStore } from '../lib/store';
import { changePassword } from '../lib/auth';
import { updateStaffRecord } from '../lib/supabase';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import Icon from '../components/Icon';
import s from './Account.module.css';

const accent = SECTION_COLORS.settings.accent;

export default function Account() {
  const auth = useAuth();
  const { staff, setStaff } = useAppStore();
  const currentStaff = staff.find(m => m.id === auth.staff?.id) || auth.staff || {};

  const [profileForm, setProfileForm] = useState({
    name: currentStaff.name || "",
    phone: currentStaff.phone || "",
  });
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const updateField = (field, value) => {
    setProfileForm(f => ({ ...f, [field]: value }));
    setProfileDirty(true);
    setProfileSaved(false);
  };

  const saveProfile = async () => {
    try {
      if (!auth.isLocalDev) {
        await updateStaffRecord(currentStaff.id, {
          fullName: profileForm.name,
          phone: profileForm.phone,
        });
      }
      setStaff(prev => prev.map(m => m.id === currentStaff.id ? { ...m, name: profileForm.name, phone: profileForm.phone } : m));
      setProfileDirty(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (pw.length < 6) { setPwError("Password must be at least 6 characters"); return; }
    if (pw !== confirmPw) { setPwError("Passwords do not match"); return; }
    setPwSaving(true);
    try {
      await changePassword(pw);
      setPwSuccess(true);
      setPw("");
      setConfirmPw("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) { setPwError(err.message); }
    setPwSaving(false);
  };

  return (
    <div>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>Account</h1>
          <p className={s.pageSubtitle}>Manage your personal profile and security settings</p>
        </div>
      </div>

      {/* Profile section */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div>
            <div className={s.sectionTitle}>Profile</div>
            <div className={s.sectionSubtitle}>Your personal information visible to your team</div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ background: accent, fontSize: 11, opacity: profileDirty ? 1 : 0.5 }}
            onClick={saveProfile}
            disabled={!profileDirty}
          >
            {profileSaved ? "Saved!" : "Save Changes"}
          </button>
        </div>
        {profileSaved && (
          <div className={s.alert}>
            <Icon name="check" size={14} /> Profile updated successfully.
          </div>
        )}
        <div className={s.card}>
          <div className={s.avatarRow}>
            <div className={s.avatarLg}>
              {(profileForm.name || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className={s.avatarName}>{profileForm.name || "—"}</div>
              <div className={s.avatarRole}>{currentStaff.role || "Staff"}</div>
            </div>
          </div>
          <div className={s.fieldGrid}>
            <div>
              <label className={s.label}>Full Name</label>
              <input value={profileForm.name} onChange={e => updateField("name", e.target.value)} className={s.input} />
            </div>
            <div>
              <label className={s.label}>Phone</label>
              <input value={profileForm.phone} onChange={e => updateField("phone", e.target.value)} className={s.input} placeholder="0412 345 678" />
            </div>
            <div>
              <label className={s.label}>Email</label>
              <input value={auth.user?.email || currentStaff.email || ""} disabled className={`${s.input} ${s.inputDisabled}`} />
              <span className={s.hint}>Contact your admin to change your email</span>
            </div>
            <div>
              <label className={s.label}>Role</label>
              <input value={currentStaff.role || "staff"} disabled className={`${s.input} ${s.inputDisabled}`} style={{ textTransform: "capitalize" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Password section */}
      {!auth.isLocalDev && (
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div>
              <div className={s.sectionTitle}>Security</div>
              <div className={s.sectionSubtitle}>Update your password</div>
            </div>
          </div>
          <div className={s.card}>
            <form onSubmit={savePassword}>
              <div className={s.fieldGrid}>
                <div>
                  <label className={s.label}>New Password</label>
                  <input type="password" value={pw} onChange={e => setPw(e.target.value)} className={s.input} placeholder="Min. 6 characters" />
                </div>
                <div>
                  <label className={s.label}>Confirm Password</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={s.input} placeholder="Repeat password" />
                </div>
              </div>
              {pwError && <div className={s.alertError}>{pwError}</div>}
              {pwSuccess && <div className={s.alert}><Icon name="check" size={14} /> Password changed successfully.</div>}
              <button type="submit" className="btn btn-primary btn-sm" style={{ background: accent, marginTop: 12, fontSize: 11 }} disabled={pwSaving || !pw}>
                {pwSaving ? "Saving..." : "Change Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
