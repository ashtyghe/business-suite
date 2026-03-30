import { useState, useEffect, memo } from "react";
import { useAppStore } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { SECTION_COLORS } from '../fixtures/seedData.jsx';
import { hexToRgba } from '../utils/helpers';
import { Icon } from '../components/Icon';
import s from './MyAssistant.module.css';

const VOICE_OPTIONS = {
  voices: [
    { id: "alloy", label: "Alloy", desc: "Neutral and balanced" },
    { id: "ash", label: "Ash", desc: "Warm and conversational" },
    { id: "ballad", label: "Ballad", desc: "Smooth and melodic" },
    { id: "coral", label: "Coral", desc: "Clear and friendly" },
    { id: "echo", label: "Echo", desc: "Deep and resonant" },
    { id: "sage", label: "Sage", desc: "Calm and articulate" },
    { id: "shimmer", label: "Shimmer", desc: "Bright and energetic" },
    { id: "verse", label: "Verse", desc: "Warm and expressive" },
  ],
  greetingStylePlaceholder: "e.g. Start every call by singing a short snippet from a random well-known song, then transition into a warm greeting",
  personalityPlaceholder: "e.g. Friendly and warm — talk like a helpful mate. Use Aussie slang like 'no worries', 'easy done', 'nice one'. Keep it brief and upbeat.",
  generalKnowledgePlaceholder: "e.g. You know Coffs Harbour — the beaches, the Big Banana, Park Beach, Sawtell. You know the local building scene and trades language.",
};

const DEFAULT_VOICE_SETTINGS = {
  name: "Iris",
  voice: "sage",
  greetingStyle: "Start every call by singing a short snippet (3-8 words) from a random well-known song, then smoothly transition into a warm greeting. Pick a different song every time — pop, rock, classic, 80s, 90s, anything catchy.",
  personality: "Friendly and warm — talk like a helpful mate, not a robot. Use 'hey', 'no worries', 'easy done', 'nice one'. Bright and positive — always upbeat, encouraging, and supportive. Keep it brief — this is a phone call. Use Australian English and throw in the occasional Aussie slang naturally — 'reckon', 'heaps', 'no dramas', 'too easy'.",
  generalKnowledge: "You know Coffs Harbour and the region — the beaches, the Big Banana, Park Beach, Sawtell, Woolgoolga. You know the local building scene — coastal builds deal with salt air corrosion, council approvals through Coffs Harbour City Council. You know the weather matters for trades work. You know the trades — sparkies, chippies, plumbers, concreters, roofers.",
  silenceDuration: 500,
  vadThreshold: 0.5,
  confirmWrites: true,
};

const DEFAULT_OUTBOUND_SETTINGS = {
  enabled: false, name: "Iris", voice: "sage",
  personality: "Professional and direct. Explain the urgent items clearly and ask if they can action them. Be respectful of their time.",
  greetingStyle: "Greet the person by name and explain you are calling from FieldOps about items that need their attention.",
  team: [
    { id: 1, name: "Tom Baker", phone: "+61400000001", role: "Site Manager", callEnabled: true },
    { id: 2, name: "Sarah Lee", phone: "+61400000002", role: "Project Manager", callEnabled: true },
  ],
  callRules: { minSeverity: "high", maxCallsPerDay: 3, callWindowStart: "07:00", callWindowEnd: "18:00" },
};

const VoiceOptionCard = ({ option, selected, onSelect, accent }) => (
  <div
    onClick={onSelect}
    className={s.voiceCard}
    style={{
      border: selected ? `2px solid ${accent}` : "2px solid #e8e8e8",
      background: selected ? hexToRgba(accent, 0.06) : "#fff",
    }}
  >
    <div className={s.voiceCardRow}>
      <div className={s.voiceRadio} style={{
        border: selected ? `5px solid ${accent}` : "2px solid #ccc",
      }} />
      <div>
        <div className={selected ? s.voiceLabelSelected : s.voiceLabelUnselected}>{option.label}</div>
        <div className={s.voiceDesc}>{option.desc}</div>
      </div>
    </div>
  </div>
);

const MyAssistant = () => {
  const auth = useAuth();
  const accent = SECTION_COLORS.assistant?.accent || "#6366f1";

  const [defaults, setDefaults] = useState({ inbound: DEFAULT_VOICE_SETTINGS, outbound: DEFAULT_OUTBOUND_SETTINGS });
  const [personalised, setPersonalised] = useState({ inbound: false, outbound: false });
  const [inboundSettings, setInboundSettings] = useState(DEFAULT_VOICE_SETTINGS);
  const [outboundSettings, setOutboundSettings] = useState(DEFAULT_OUTBOUND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inbound");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load: 1) admin defaults, 2) user overrides
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let inDef = DEFAULT_VOICE_SETTINGS;
      let outDef = DEFAULT_OUTBOUND_SETTINGS;

      // Load admin defaults
      if (supabase && auth.user) {
        try {
          const { data: defs } = await supabase.from('voice_settings_defaults').select('*');
          const inRow = defs?.find(d => d.type === 'inbound');
          const outRow = defs?.find(d => d.type === 'outbound');
          if (inRow?.settings) inDef = { ...DEFAULT_VOICE_SETTINGS, ...inRow.settings };
          if (outRow?.settings) outDef = { ...DEFAULT_OUTBOUND_SETTINGS, ...outRow.settings };
        } catch (err) {
          console.warn("Could not load voice defaults:", err.message);
        }
      }
      if (!cancelled) setDefaults({ inbound: inDef, outbound: outDef });

      // Load user overrides
      if (supabase && auth.user) {
        try {
          const { data: userSettings } = await supabase.from('voice_settings')
            .select('*').eq('user_id', auth.user.id);

          const userIn = userSettings?.find(s => s.type === 'inbound');
          const userOut = userSettings?.find(s => s.type === 'outbound');

          if (!cancelled) {
            setPersonalised({
              inbound: userIn?.personalised || false,
              outbound: userOut?.personalised || false,
            });
            setInboundSettings(userIn?.personalised ? { ...DEFAULT_VOICE_SETTINGS, ...userIn.settings } : inDef);
            setOutboundSettings(userOut?.personalised ? { ...DEFAULT_OUTBOUND_SETTINGS, ...userOut.settings } : outDef);
          }
        } catch (err) {
          console.warn("Could not load user voice settings:", err.message);
          if (!cancelled) {
            setInboundSettings(inDef);
            setOutboundSettings(outDef);
          }
        }
      } else {
        // localStorage fallback
        try {
          const localIn = localStorage.getItem("fieldops_voice_settings");
          if (localIn) {
            const parsed = JSON.parse(localIn);
            if (!cancelled) setInboundSettings({ ...DEFAULT_VOICE_SETTINGS, ...parsed });
          }
        } catch {}
        try {
          const localOut = localStorage.getItem("fieldops_outbound_settings");
          if (localOut && !cancelled) setOutboundSettings({ ...DEFAULT_OUTBOUND_SETTINGS, ...JSON.parse(localOut) });
        } catch {}
      }

      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [auth.user?.id]);

  // Toggle personalisation
  const togglePersonalised = async (type) => {
    const newVal = !personalised[type];
    setPersonalised(prev => ({ ...prev, [type]: newVal }));

    if (!newVal) {
      // Turning off: revert to admin defaults
      if (type === 'inbound') setInboundSettings({ ...defaults.inbound });
      else setOutboundSettings({ ...defaults.outbound });
    }

    // Save the toggle state
    if (supabase && auth.user) {
      const settings = type === 'inbound' ? inboundSettings : outboundSettings;
      try {
        await supabase.from('voice_settings').upsert({
          user_id: auth.user.id, type, personalised: newVal,
          settings: newVal ? settings : {}, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,type' });
      } catch (err) {
        console.warn("Could not save personalisation toggle:", err.message);
      }
    }
    setDirty(false);
    setSaved(false);
  };

  // Save personalised settings
  const saveSettings = async (type) => {
    const settings = type === 'inbound' ? inboundSettings : outboundSettings;
    if (supabase && auth.user) {
      try {
        await supabase.from('voice_settings').upsert({
          user_id: auth.user.id, type, personalised: true,
          settings, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,type' });
      } catch (err) {
        console.warn("Could not save personalised voice settings:", err.message);
      }
    }
    setSaved(true); setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateInbound = (key, value) => { setInboundSettings(prev => ({ ...prev, [key]: value })); setDirty(true); setSaved(false); };
  const updateOutbound = (key, value) => { setOutboundSettings(prev => ({ ...prev, [key]: value })); setDirty(true); setSaved(false); };

  if (loading) return <div className={s.loadingState}><img src="/loading-logo.svg" alt="Loading" style={{ width: 80 }} /></div>;

  const isPersonalised = personalised[activeTab];
  const currentSettings = activeTab === 'inbound' ? inboundSettings : outboundSettings;
  const currentDefaults = defaults[activeTab];
  const updateFn = activeTab === 'inbound' ? updateInbound : updateOutbound;

  return (
    <div>
      {/* Tab navigation */}
      <div className={s.tabNav}>
        {[{ id: "inbound", label: "Inbound" }, { id: "outbound", label: "Outbound" }].map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setDirty(false); setSaved(false); }} className="btn"
            style={{
              display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", fontSize: 13, fontWeight: 600,
              border: "none", borderBottom: activeTab === t.id ? `2px solid ${accent}` : "2px solid transparent",
              borderRadius: 0, background: "transparent", color: activeTab === t.id ? "#111" : "#888",
              cursor: "pointer", transition: "all 0.15s",
            }}>{t.label}</button>
        ))}
      </div>

      {/* Personalisation toggle */}
      <div className={s.toggleCard}>
        <div>
          <div className={s.toggleTitle}>Personalise my {activeTab} assistant</div>
          <div className={s.toggleDesc}>
            {isPersonalised ? "Your custom settings are active." : "When off, the company default settings apply. Turn on to customise your own assistant."}
          </div>
        </div>
        <button onClick={() => togglePersonalised(activeTab)} className={s.toggleSwitch} style={{ background: isPersonalised ? accent : "#ccc" }}>
          <div className={s.toggleKnob} style={{ left: isPersonalised ? 23 : 3 }} />
        </button>
      </div>

      {/* Saved banner */}
      {saved && (
        <div className={s.savedBanner}>
          <Icon name="check" size={14} /> Settings saved. Changes will apply to the next call.
        </div>
      )}

      {!isPersonalised && (
        <div className={s.defaultsBanner}>
          Company Defaults — these settings are managed by your admin.
        </div>
      )}

      {/* Assistant Name */}
      <div className={s.card}>
        <div className={s.label}>Assistant Name</div>
        {isPersonalised ? (
          <input type="text" value={currentSettings.name} onChange={e => updateFn("name", e.target.value)} placeholder="e.g. Iris, Billy, Sage" className={`${s.input} ${s.inputNarrow}`} />
        ) : (
          <input type="text" value={currentDefaults.name} disabled className={`${s.inputDisabled} ${s.inputNarrow}`} />
        )}
        <div className={s.helpText}>The name your assistant introduces itself as on calls</div>
      </div>

      {/* Voice Selection */}
      <div className={s.card}>
        <div className={s.label}>Voice</div>
        {activeTab === 'inbound' ? (
          <div className={isPersonalised ? s.voiceGrid : s.voiceGridDisabled}>
            {VOICE_OPTIONS.voices.map(v => (
              <VoiceOptionCard key={v.id} option={v} selected={(isPersonalised ? currentSettings : currentDefaults).voice === v.id} onSelect={() => updateFn("voice", v.id)} accent={accent} />
            ))}
          </div>
        ) : (
          isPersonalised ? (
            <select value={currentSettings.voice} onChange={e => updateFn("voice", e.target.value)} className={`${s.input} ${s.selectNarrow}`}>
              {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
            </select>
          ) : (
            <select value={currentDefaults.voice} disabled className={`${s.inputDisabled} ${s.selectNarrow}`}>
              {VOICE_OPTIONS.voices.map(v => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
            </select>
          )
        )}
      </div>

      {/* Greeting Style */}
      <div className={s.card}>
        <div className={s.label}>Greeting Style</div>
        {isPersonalised ? (
          <textarea value={currentSettings.greetingStyle} onChange={e => updateFn("greetingStyle", e.target.value)} placeholder={VOICE_OPTIONS.greetingStylePlaceholder} rows={3} className={s.textarea} />
        ) : (
          <textarea value={currentDefaults.greetingStyle || ""} disabled rows={3} className={s.textareaDisabled} />
        )}
      </div>

      {/* Personality */}
      <div className={s.card}>
        <div className={s.label}>Personality</div>
        {isPersonalised ? (
          <textarea value={currentSettings.personality} onChange={e => updateFn("personality", e.target.value)} placeholder={VOICE_OPTIONS.personalityPlaceholder} rows={3} className={s.textarea} />
        ) : (
          <textarea value={currentDefaults.personality || ""} disabled rows={3} className={s.textareaDisabled} />
        )}
      </div>

      {/* General Knowledge — inbound only */}
      {activeTab === 'inbound' && (
        <div className={s.card}>
          <div className={s.label}>General Knowledge</div>
          {isPersonalised ? (
            <textarea value={currentSettings.generalKnowledge} onChange={e => updateFn("generalKnowledge", e.target.value)} placeholder={VOICE_OPTIONS.generalKnowledgePlaceholder} rows={3} className={s.textarea} />
          ) : (
            <textarea value={currentDefaults.generalKnowledge || ""} disabled rows={3} className={s.textareaDisabled} />
          )}
          <div className={s.helpText}>Any background knowledge your assistant should have — local area, industry, etc.</div>
        </div>
      )}

      {/* Save button — only when personalised and dirty */}
      {isPersonalised && dirty && (
        <div className={s.saveRow}>
          <button className="btn btn-primary btn-sm" style={{ background: accent }} onClick={() => saveSettings(activeTab)}>
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default memo(MyAssistant);
