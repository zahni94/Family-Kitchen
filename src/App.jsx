import { useState } from "react";

const INTOLERANCES = [
  { id: "gluten",    label: "Gluten",        emoji: "🌾" },
  { id: "lactose",   label: "Laktose",       emoji: "🥛" },
  { id: "dairy",     label: "Milchprodukte", emoji: "🧀" },
  { id: "nuts",      label: "Nüsse",         emoji: "🥜" },
  { id: "eggs",      label: "Eier",          emoji: "🥚" },
  { id: "fish",      label: "Fisch",         emoji: "🐟" },
  { id: "soy",       label: "Soja",          emoji: "🫘" },
  { id: "shellfish", label: "Meeresfrüchte", emoji: "🦐" },
  { id: "pork",      label: "Schwein",       emoji: "🐷" },
  { id: "fructose",  label: "Fruktose",      emoji: "🍎" },
];

const PREFERENCES = [
  { id: "vegetarian",    label: "Vegetarisch",     emoji: "🥗" },
  { id: "vegan",         label: "Vegan",           emoji: "🌱" },
  { id: "lowcarb",       label: "Low Carb",        emoji: "🥩" },
  { id: "mediterranean", label: "Mediterran",      emoji: "🫒" },
  { id: "asian",         label: "Asiatisch",       emoji: "🍜" },
  { id: "quick",         label: "Schnelle Küche",  emoji: "⚡" },
  { id: "hearty",        label: "Deftig",          emoji: "🍖" },
  { id: "light",         label: "Leicht & Frisch", emoji: "🥒" },
  { id: "italian",       label: "Italienisch",     emoji: "🍝" },
];

const DAYS  = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const MEALS = ["Frühstück","Mittagessen","Abendessen"];

const MEMBER_COLORS = [
  { bg:"#c2623a", light:"#fef0ea", border:"#e07d54" },
  { bg:"#5a7a5c", light:"#edf4ee", border:"#7aaa7c" },
  { bg:"#7a5a8c", light:"#f3edf8", border:"#a07ab0" },
  { bg:"#4a7a9b", light:"#eaf2f8", border:"#6aaac8" },
];

const EMOJIS = ["👤","👨","👩","🧑","👦","👧","🧓","👴","👵","🧒","👶"];

const newMember = (name="", emoji="🧑") => ({
  id: Date.now() + Math.random(), name, emoji, intolerances: [], preferences: [],
  dislikedIngredients: [], // free-text list of disliked ingredients
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function Spinner({ label }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem",padding:"2.5rem"}}>
      <div className="spinner" />
      {label && <p style={{fontSize:".85rem",color:"var(--mid)",textAlign:"center"}}>{label}</p>}
    </div>
  );
}

function buildFamilyText(members, people) {
  if (!members.length) return `Portionen für ${people} Personen.`;
  const parts = members.map(m => {
    const intol    = m.intolerances.map(id => INTOLERANCES.find(i=>i.id===id)?.label).join(", ");
    const prefs    = m.preferences.map(id => PREFERENCES.find(i=>i.id===id)?.label).join(", ");
    const dislikes = (m.dislikedIngredients || []).join(", ");
    let desc = m.name || "Person";
    if (intol)    desc += ` (Unverträglichkeiten: ${intol})`;
    if (dislikes) desc += ` (mag nicht: ${dislikes})`;
    if (prefs)    desc += ` (Vorlieben: ${prefs})`;
    return desc;
  });
  return `Familienmitglieder: ${parts.join(" | ")}. Portionen für ${people} Personen.`;
}

function getAllIntolerances(members) {
  const s = new Set();
  members.forEach(m => m.intolerances.forEach(id => s.add(id)));
  return [...s];
}

function getAllDislikes(members) {
  return members
    .filter(m => m.dislikedIngredients?.length)
    .map(m => ({ name: m.name || "?", ingredients: m.dislikedIngredients }));
}

// Processes streaming tool-use responses from the Anthropic API
async function callClaudeWithWebSearch(messages, onStatus) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    }),
  });
  const data = await res.json();

  // If Claude used web search, run a follow-up with the tool result included
  if (data.stop_reason === "tool_use") {
    const toolUseBlock = data.content.find(b => b.type === "tool_use");
    onStatus && onStatus("🌐 Suche im Internet nach aktuellen Rezepten…");

    const followUp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          ...messages,
          { role: "assistant", content: data.content },
          {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: toolUseBlock.id,
              content: toolUseBlock.input?.query
                ? `Suchergebnisse für "${toolUseBlock.input.query}" wurden gefunden. Nutze diese Informationen um aktuelle, echte Rezepte zu erstellen.`
                : "Suchergebnisse erhalten.",
            }],
          },
        ],
      }),
    });
    return await followUp.json();
  }

  return data;
}

// ── Member Editor ─────────────────────────────────────────────────────────────
function MemberEditor({ member, color, onChange, onRemove, canRemove }) {
  const [newDislike, setNewDislike] = useState("");

  const toggle = (key, id) =>
    onChange({ ...member, [key]: member[key].includes(id)
      ? member[key].filter(x => x !== id)
      : [...member[key], id] });

  const addDislike = () => {
    const val = newDislike.trim();
    if (!val) return;
    const existing = member.dislikedIngredients || [];
    if (!existing.map(d=>d.toLowerCase()).includes(val.toLowerCase())) {
      onChange({ ...member, dislikedIngredients: [...existing, val] });
    }
    setNewDislike("");
  };

  const removeDislike = (item) =>
    onChange({ ...member, dislikedIngredients: (member.dislikedIngredients||[]).filter(d=>d!==item) });

  return (
    <div className="member-card" style={{"--mc":color.bg,"--mc-light":color.light,"--mc-border":color.border}}>
      <div className="member-header">
        <div className="member-avatar-row">
          <select className="emoji-pick" value={member.emoji} onChange={e=>onChange({...member,emoji:e.target.value})}>
            {EMOJIS.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
          <input className="name-input" placeholder="Name eingeben…" value={member.name}
            onChange={e=>onChange({...member,name:e.target.value})} />
        </div>
        {canRemove && <button className="remove-btn" onClick={onRemove}>✕</button>}
      </div>
      <div className="field-group">
        <label className="field-label">Unverträglichkeiten</label>
        <div className="chip-grid">
          {INTOLERANCES.map(i=>(
            <button key={i.id}
              className={`chip ${member.intolerances.includes(i.id)?"chip-on intol":""}`}
              onClick={()=>toggle("intolerances",i.id)}>
              {i.emoji} {i.label}
            </button>
          ))}
        </div>
      </div>

      {/* Disliked Ingredients */}
      <div className="field-group">
        <label className="field-label">🚫 Mag nicht</label>
        <p className="field-hint">Zutaten die {member.name||"diese Person"} nicht mag – werden bei Rezepten vermieden oder als Hinweis markiert.</p>
        <div className="dislike-input-row">
          <input
            className="dislike-input"
            placeholder="z.B. Rosenkohl, Zwiebeln, Koriander…"
            value={newDislike}
            onChange={e=>setNewDislike(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"||e.key===","){e.preventDefault();addDislike();} }}
          />
          <button className="add-dislike-btn" onClick={addDislike}>+ Hinzufügen</button>
        </div>
        {(member.dislikedIngredients||[]).length > 0 && (
          <div className="dislike-chips">
            {(member.dislikedIngredients||[]).map(d=>(
              <span key={d} className="dislike-chip">
                🚫 {d}
                <button className="dislike-remove" onClick={()=>removeDislike(d)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="field-group">
        <label className="field-label">Vorlieben</label>
        <div className="chip-grid">
          {PREFERENCES.map(p=>(
            <button key={p.id}
              className={`chip ${member.preferences.includes(p.id)?"chip-on pref":""}`}
              onClick={()=>toggle("preferences",p.id)}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Recipe Modal ──────────────────────────────────────────────────────────────
function RecipeModal({ recipe, members, onClose }) {
  const whoHas = (intolId) =>
    members.filter(m=>m.intolerances.includes(intolId)).map(m=>m.name||"Unbekannt");

  // For a given ingredient string, find which members dislike it
  const whoDislikesIng = (ing) => {
    const ingLower = ing.toLowerCase();
    return members.filter(m =>
      (m.dislikedIngredients||[]).some(d => ingLower.includes(d.toLowerCase()) || d.toLowerCase().includes(ingLower.split(" ").pop()))
    ).map(m => m.name || "?");
  };

  const hasSubst = recipe.substitutions?.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e=>e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>

        {recipe.source && (
          <div className="source-badge">🌐 Quelle: {recipe.source}</div>
        )}

        <div className="modal-emoji">{recipe.emoji}</div>
        <h2 className="modal-title">{recipe.name}</h2>
        <div className="modal-meta">
          <span>⏱ {recipe.time} Min.</span>
          <span>👥 {recipe.servings} Pers.</span>
          <span>📊 {recipe.difficulty}</span>
        </div>
        {recipe.tags?.length>0 && (
          <div className="modal-tags">
            {recipe.tags.map(t=><span key={t} className="tag">{t}</span>)}
          </div>
        )}

        {hasSubst && (
          <div className="subst-banner">
            <div className="subst-banner-title">🔄 Zutatentausch für die Familie</div>
            {recipe.substitutions.map((s,i)=>{
              const who = s.forIntolerance ? whoHas(s.forIntolerance) : [];
              return (
                <div key={i} className="subst-item">
                  <div className="subst-row">
                    <span className="subst-original">❌ {s.original}</span>
                    <span className="subst-arrow">→</span>
                    <span className="subst-replace">✅ {s.replacement}</span>
                  </div>
                  {who.length>0 && (
                    <div className="subst-for">
                      Für: {who.map(n=><span key={n} className="name-badge">{n}</span>)}
                    </div>
                  )}
                  {s.note && <div className="subst-note">{s.note}</div>}
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-section">
          <h3>Zutaten</h3>
          <ul className="ingredient-list">
            {recipe.ingredients?.map((ing,i)=>{
              const conflict  = recipe.substitutions?.find(s=>
                ing.toLowerCase().includes((s.original||"").toLowerCase()));
              const dislikers = whoDislikesIng(ing);
              return (
                <li key={i} className={conflict?"ing-conflict":dislikers.length?"ing-dislike":""}>
                  {conflict && "⚠️ "}
                  {!conflict && dislikers.length>0 && "😕 "}
                  {ing}
                  {dislikers.length>0 && !conflict && (
                    <span className="ing-dislike-who"> — mag nicht: {dislikers.join(", ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="modal-section">
          <h3>Zubereitung</h3>
          <ol className="steps-list">
            {recipe.steps?.map((step,i)=><li key={i}>{step}</li>)}
          </ol>
        </div>

        {recipe.sourceUrl && (
          <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            🔗 Originalrezept aufrufen
          </a>
        )}
      </div>
    </div>
  );
}

// ── Family Summary Bar ────────────────────────────────────────────────────────
function FamilyBar({ members }) {
  const allIntol   = getAllIntolerances(members);
  const allDislikes = getAllDislikes(members);
  return (
    <div className="family-bar">
      <div className="family-avatars">
        {members.map((m,i)=>(
          <div key={m.id} className="avatar-chip"
            style={{background:MEMBER_COLORS[i%MEMBER_COLORS.length].light,
                    borderColor:MEMBER_COLORS[i%MEMBER_COLORS.length].border}}>
            <span>{m.emoji}</span>
            <span className="avatar-name">{m.name||"?"}</span>
            {m.intolerances.length>0 && (
              <span className="avatar-intol">
                {m.intolerances.map(id=>INTOLERANCES.find(i=>i.id===id)?.emoji).join("")}
              </span>
            )}
            {m.dislikedIngredients?.length>0 && (
              <span className="avatar-dislikes">🚫{m.dislikedIngredients.length}</span>
            )}
          </div>
        ))}
      </div>
      {allIntol.length>0 && (
        <div className="intol-summary">
          ⚠️ Unverträglichkeiten: {allIntol.map(id=>INTOLERANCES.find(i=>i.id===id)?.label).join(", ")}
        </div>
      )}
      {allDislikes.length>0 && (
        <div className="intol-summary" style={{marginTop:".25rem"}}>
          🚫 Abneigungen: {allDislikes.map(d=>`${d.name} (${d.ingredients.join(", ")})`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]     = useState("cookbook");
  const [members, setMembers] = useState([
    { ...newMember("Ich","👨"), id:1 },
    { ...newMember("Meine Frau","👩"), id:2 },
  ]);
  const [people, setPeople]   = useState(4);
  const [recipes, setRecipes] = useState([]);
  const [plan, setPlan]       = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [webSearch, setWebSearch] = useState(true);

  const updateMember = (id, updated) => setMembers(ms=>ms.map(m=>m.id===id?updated:m));
  const removeMember = (id) => setMembers(ms=>ms.filter(m=>m.id!==id));
  const addMember    = ()   => setMembers(ms=>[...ms, {...newMember("","🧑"),id:Date.now()}]);

  const generateRecipes = async () => {
    setLoading(true);
    setRecipes([]);
    setLoadingStatus(webSearch ? "🔍 Suche im Internet nach passenden Rezepten…" : "🍳 Erstelle Rezepte…");

    const familyText = buildFamilyText(members, people);
    const allIntol   = getAllIntolerances(members);
    const intolNames = allIntol.map(id=>INTOLERANCES.find(i=>i.id===id)?.label).join(", ");

    const prompt = `Du bist ein Familienkoch-Assistent.
${webSearch ? `Suche ZUERST im Internet nach aktuellen, beliebten Rezepten${searchQuery ? ` zum Thema "${searchQuery}"` : ""} und nutze echte Rezepte als Grundlage.` : ""}

Erstelle dann 8 konkrete Rezepte für diese Familie:
${familyText}
${searchQuery ? `Gewünschtes Gericht/Stichwort: "${searchQuery}"` : ""}

WICHTIG: Falls Zutaten gegen Unverträglichkeiten verstoßen (${intolNames||"keine vorhanden"}), gib IMMER Austauschvorschläge in "substitutions" an, mit "forIntolerance" als Schlüssel-ID.

Antworte NUR mit einem JSON-Array ohne Backticks:
[
  {
    "name": "Rezeptname",
    "emoji": "🍲",
    "time": 30,
    "servings": ${people},
    "difficulty": "Einfach",
    "tags": ["tag1","tag2"],
    "source": "Woher das Rezept stammt, z.B. 'Chefkoch.de' oder 'Klassisches Familienrezept'",
    "sourceUrl": "https://... falls verfügbar, sonst null",
    "ingredients": ["200g Zutat 1","1 EL Zutat 2"],
    "steps": ["Schritt 1","Schritt 2","Schritt 3"],
    "substitutions": [
      {
        "original": "Weizenmehl",
        "replacement": "Glutenfreies Mehl",
        "forIntolerance": "gluten",
        "note": "Gleiche Menge, Teig evtl. etwas mehr Wasser."
      }
    ]
  }
]`;

    try {
      let data;
      if (webSearch) {
        data = await callClaudeWithWebSearch(
          [{ role:"user", content: prompt }],
          setLoadingStatus
        );
      } else {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
            messages:[{role:"user",content:prompt}] }),
        });
        data = await res.json();
      }

      setLoadingStatus("📝 Rezepte werden aufbereitet…");
      const text = data.content.map(c=>c.text||"").join("");
      const clean = text.replace(/```json|```/g,"").trim();
      // Extract JSON array even if there's surrounding text
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) setRecipes(JSON.parse(match[0]));
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
    setLoadingStatus("");
  };

  const generatePlan = async () => {
    setPlanLoading(true); setPlan({});
    const familyText = buildFamilyText(members, people);
    const prompt = `Erstelle einen 7-Tage-Familienessensplan für: ${familyText}.
Berücksichtige alle Unverträglichkeiten und Vorlieben. Halte Mahlzeiten kurz und appetitlich beschrieben (max. 1 Satz).
Antworte NUR mit einem JSON-Objekt ohne Backticks:
{"Montag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Dienstag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Mittwoch":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Donnerstag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Freitag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Samstag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."},"Sonntag":{"Frühstück":"...","Mittagessen":"...","Abendessen":"..."}}`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{role:"user",content:prompt}] }),
      });
      const data = await res.json();
      const text = data.content.map(c=>c.text||"").join("");
      const match = text.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
      if (match) setPlan(JSON.parse(match[0]));
    } catch(e){ console.error(e); }
    setPlanLoading(false);
  };

  return (
    <>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lato:wght@300;400;700&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      :root{
        --cream:#fdf6ec;--warm:#f0e4d0;--terracotta:#c2623a;--terra-dark:#8b3e20;
        --sage:#5a7a5c;--charcoal:#2c2c2c;--mid:#6b6b6b;--light:#aaaaaa;--white:#ffffff;
        --blue:#3a7bc2;--blue-light:#eaf2fb;
        --shadow:0 4px 24px rgba(44,44,44,.10);--radius:16px;
      }
      body{background:var(--cream);font-family:'Lato',sans-serif;color:var(--charcoal);min-height:100vh;}
      .app{max-width:940px;margin:0 auto;padding:0 1rem 5rem;}

      .header{text-align:center;padding:2.5rem 1rem 1rem;}
      .header-badge{display:inline-block;background:var(--terracotta);color:#fff;font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.3rem .9rem;border-radius:99px;margin-bottom:.9rem;}
      .header h1{font-family:'Playfair Display',serif;font-size:clamp(1.9rem,5vw,3rem);line-height:1.1;margin-bottom:.45rem;}
      .header p{color:var(--mid);font-size:.92rem;font-weight:300;}

      .tabs{display:flex;gap:.5rem;background:var(--warm);border-radius:12px;padding:.4rem;margin-bottom:1.5rem;}
      .tab{flex:1;padding:.65rem .5rem;border:none;background:transparent;border-radius:8px;font-family:'Lato',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer;transition:all .2s;color:var(--mid);}
      .tab.active{background:var(--white);color:var(--terracotta);box-shadow:var(--shadow);}

      .card{background:var(--white);border-radius:var(--radius);padding:1.4rem;box-shadow:var(--shadow);margin-bottom:1.1rem;}
      .section-title{font-family:'Playfair Display',serif;font-size:1.35rem;margin-bottom:1.1rem;}
      .field-group{margin-bottom:1.2rem;}
      .field-label{display:block;font-weight:700;font-size:.75rem;letter-spacing:.09em;text-transform:uppercase;color:var(--mid);margin-bottom:.6rem;}

      .chip-grid{display:flex;flex-wrap:wrap;gap:.4rem;}
      .chip{padding:.38rem .82rem;border:1.5px solid var(--warm);border-radius:99px;background:transparent;font-family:'Lato',sans-serif;font-size:.82rem;cursor:pointer;transition:all .18s;color:var(--charcoal);}
      .chip:hover{border-color:var(--terracotta);}
      .chip-on.intol{background:#fef0ea;border-color:var(--terracotta);color:var(--terracotta);}
      .chip-on.pref{background:#edf4ee;border-color:var(--sage);color:var(--sage);}

      .primary-btn{background:var(--terracotta);color:#fff;border:none;padding:.78rem 1.6rem;border-radius:99px;font-family:'Lato',sans-serif;font-weight:700;font-size:.88rem;cursor:pointer;transition:all .2s;}
      .primary-btn:hover{background:var(--terra-dark);transform:translateY(-1px);}
      .primary-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}

      .number-row{display:flex;align-items:center;gap:.9rem;}
      .num-btn{width:34px;height:34px;border:1.5px solid var(--warm);background:transparent;border-radius:50%;font-size:1.1rem;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;}
      .num-btn:hover{border-color:var(--terracotta);color:var(--terracotta);}
      .num-val{font-family:'Playfair Display',serif;font-size:1.5rem;min-width:1.8rem;text-align:center;}

      .member-card{background:var(--white);border-radius:var(--radius);padding:1.3rem;box-shadow:var(--shadow);margin-bottom:1rem;border-top:4px solid var(--mc,var(--terracotta));}
      .member-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;}
      .member-avatar-row{display:flex;align-items:center;gap:.7rem;}
      .emoji-pick{font-size:1.5rem;border:none;background:transparent;cursor:pointer;padding:0;}
      .name-input{border:none;border-bottom:2px solid var(--warm);font-family:'Playfair Display',serif;font-size:1.1rem;padding:.25rem .3rem;outline:none;background:transparent;min-width:150px;transition:border-color .2s;}
      .name-input:focus{border-color:var(--mc,var(--terracotta));}
      .remove-btn{background:var(--warm);border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:.85rem;flex-shrink:0;}
      .add-member-btn{width:100%;padding:.8rem;border:2px dashed var(--warm);background:transparent;border-radius:var(--radius);cursor:pointer;font-family:'Lato',sans-serif;font-size:.88rem;color:var(--mid);transition:all .2s;margin-bottom:1rem;}
      .add-member-btn:hover{border-color:var(--terracotta);color:var(--terracotta);}

      .family-bar{background:var(--warm);border-radius:12px;padding:.9rem 1.1rem;margin-bottom:1.1rem;}
      .family-avatars{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.4rem;}
      .avatar-chip{display:flex;align-items:center;gap:.35rem;padding:.35rem .75rem;border-radius:99px;border:1.5px solid;font-size:.82rem;}
      .avatar-name{font-weight:700;}
      .avatar-intol{font-size:.78rem;margin-left:.1rem;}
      .intol-summary{font-size:.78rem;color:var(--mid);padding-top:.4rem;border-top:1px solid rgba(0,0,0,.08);margin-top:.4rem;}

      /* Web search toggle */
      .search-options{display:flex;align-items:center;gap:.6rem;margin-bottom:.9rem;flex-wrap:wrap;}
      .toggle-row{display:flex;align-items:center;gap:.55rem;cursor:pointer;user-select:none;}
      .toggle-track{width:40px;height:22px;border-radius:99px;background:var(--warm);transition:background .2s;position:relative;flex-shrink:0;}
      .toggle-track.on{background:var(--blue);}
      .toggle-thumb{width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.2);}
      .toggle-track.on .toggle-thumb{left:21px;}
      .toggle-label{font-size:.82rem;color:var(--mid);font-weight:600;}
      .toggle-label.on{color:var(--blue);}
      .web-badge{background:var(--blue-light);color:var(--blue);font-size:.7rem;font-weight:700;padding:.18rem .55rem;border-radius:99px;border:1px solid #b3d4f0;}

      .search-row{display:flex;gap:.6rem;}
      .search-input{flex:1;padding:.72rem 1.1rem;border:1.5px solid var(--warm);border-radius:99px;font-family:'Lato',sans-serif;font-size:.9rem;outline:none;transition:border-color .2s;background:var(--white);}
      .search-input:focus{border-color:var(--terracotta);}

      .recipe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:1rem;}
      .recipe-tile{background:var(--white);border:1.5px solid var(--warm);border-radius:var(--radius);padding:1.15rem;cursor:pointer;transition:all .2s;position:relative;}
      .recipe-tile:hover{border-color:var(--terracotta);transform:translateY(-2px);box-shadow:var(--shadow);}
      .recipe-emoji{font-size:2.3rem;margin-bottom:.5rem;}
      .recipe-name{font-family:'Playfair Display',serif;font-size:1rem;margin-bottom:.45rem;line-height:1.25;}
      .recipe-meta{display:flex;gap:.6rem;font-size:.75rem;color:var(--light);}
      .recipe-tags{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.55rem;}
      .tag{font-size:.68rem;background:var(--warm);padding:.18rem .52rem;border-radius:99px;color:var(--mid);}
      .subst-badge{position:absolute;top:.7rem;right:.7rem;background:var(--terracotta);color:#fff;font-size:.62rem;font-weight:700;padding:.18rem .5rem;border-radius:99px;}
      .web-tile-badge{position:absolute;bottom:.7rem;right:.7rem;font-size:.62rem;background:var(--blue-light);color:var(--blue);border:1px solid #b3d4f0;padding:.15rem .45rem;border-radius:99px;font-weight:700;}

      .plan-grid{display:flex;flex-direction:column;gap:.8rem;}
      .day-card{background:var(--white);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);}
      .day-header{background:var(--terracotta);color:#fff;padding:.58rem 1.1rem;font-weight:700;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;}
      .day-meals{display:grid;grid-template-columns:repeat(3,1fr);}
      .meal-cell{padding:.85rem 1rem;border-right:1px solid var(--warm);}
      .meal-cell:last-child{border-right:none;}
      .meal-label{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--light);margin-bottom:.28rem;}
      .meal-text{font-size:.83rem;line-height:1.35;}

      .modal-overlay{position:fixed;inset:0;background:rgba(44,44,44,.55);display:flex;align-items:center;justify-content:center;z-index:100;padding:1rem;backdrop-filter:blur(4px);}
      .modal-card{background:var(--white);border-radius:var(--radius);padding:2rem;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;position:relative;}
      .close-btn{position:absolute;top:1rem;right:1rem;background:var(--warm);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:.9rem;}
      .modal-emoji{font-size:2.8rem;margin-bottom:.4rem;}
      .modal-title{font-family:'Playfair Display',serif;font-size:1.55rem;margin-bottom:.7rem;}
      .modal-meta{display:flex;gap:1rem;font-size:.83rem;color:var(--mid);margin-bottom:.7rem;}
      .modal-tags{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1.1rem;}
      .modal-section{margin-bottom:1.2rem;}
      .modal-section h3{font-family:'Playfair Display',serif;font-size:1rem;color:var(--terracotta);margin-bottom:.6rem;}
      .ingredient-list{list-style:none;display:flex;flex-direction:column;gap:.28rem;font-size:.88rem;}
      .ingredient-list li::before{content:"· ";color:var(--terracotta);font-weight:700;}
      .ing-conflict{color:#b85a2a;font-weight:600;}
      .ing-dislike{color:#7a5500;}
      .ing-dislike-who{font-size:.78rem;font-style:italic;color:var(--light);}
      .steps-list{padding-left:1.3rem;display:flex;flex-direction:column;gap:.55rem;font-size:.88rem;line-height:1.5;color:var(--mid);}
      .source-badge{display:inline-flex;align-items:center;gap:.3rem;background:var(--blue-light);color:var(--blue);font-size:.75rem;font-weight:700;padding:.3rem .75rem;border-radius:99px;margin-bottom:.9rem;border:1px solid #b3d4f0;}
      .source-link{display:inline-block;margin-top:.5rem;font-size:.83rem;color:var(--blue);text-decoration:none;font-weight:700;}
      .source-link:hover{text-decoration:underline;}

      .subst-banner{background:linear-gradient(135deg,#fff8f5,#fff3ee);border:1.5px solid #f0c4b0;border-radius:12px;padding:1rem 1.1rem;margin-bottom:1.2rem;}
      .subst-banner-title{font-weight:700;font-size:.85rem;color:var(--terracotta);margin-bottom:.8rem;}
      .subst-item{margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid #f0c4b0;}
      .subst-item:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none;}
      .subst-row{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;font-size:.88rem;margin-bottom:.3rem;}
      .subst-original{text-decoration:line-through;color:var(--light);}
      .subst-arrow{color:var(--terracotta);font-weight:700;font-size:1rem;}
      .subst-replace{font-weight:700;color:var(--sage);}
      .subst-for{font-size:.78rem;color:var(--mid);margin-bottom:.25rem;display:flex;align-items:center;gap:.3rem;flex-wrap:wrap;}
      .name-badge{background:var(--warm);padding:.1rem .45rem;border-radius:99px;font-weight:700;color:var(--charcoal);font-size:.75rem;}
      .subst-note{font-size:.78rem;color:var(--mid);font-style:italic;}

      /* Disliked ingredients */
      .field-hint{font-size:.78rem;color:var(--light);margin-bottom:.6rem;line-height:1.4;}
      .dislike-input-row{display:flex;gap:.5rem;margin-bottom:.6rem;}
      .dislike-input{flex:1;padding:.5rem .9rem;border:1.5px solid var(--warm);border-radius:99px;font-family:'Lato',sans-serif;font-size:.85rem;outline:none;transition:border-color .2s;}
      .dislike-input:focus{border-color:#d07a5a;}
      .add-dislike-btn{padding:.5rem 1rem;background:#fef0ea;color:var(--terracotta);border:1.5px solid #f0c4b0;border-radius:99px;font-family:'Lato',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .18s;}
      .add-dislike-btn:hover{background:var(--terracotta);color:#fff;}
      .dislike-chips{display:flex;flex-wrap:wrap;gap:.4rem;}
      .dislike-chip{display:inline-flex;align-items:center;gap:.35rem;background:#fff0f0;border:1.5px solid #f5c0c0;color:#b03030;font-size:.8rem;padding:.28rem .7rem;border-radius:99px;}
      .dislike-remove{background:none;border:none;cursor:pointer;color:#c05050;font-size:.7rem;padding:0;line-height:1;margin-left:.1rem;}
      .dislike-remove:hover{color:#900;}
      .avatar-dislikes{font-size:.72rem;color:#b03030;margin-left:.1rem;}

      .saved-badge{background:var(--sage);color:#fff;padding:.3rem .8rem;border-radius:99px;font-size:.8rem;font-weight:700;display:inline-block;margin-left:.8rem;animation:fadeIn .2s;}
      @keyframes fadeIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
      .spinner{width:36px;height:36px;border:3px solid var(--warm);border-top-color:var(--terracotta);border-radius:50%;animation:spin .7s linear infinite;}
      @keyframes spin{to{transform:rotate(360deg)}}
      .empty-state{text-align:center;padding:3rem 1rem;color:var(--light);}
      .empty-state .icon{font-size:3rem;margin-bottom:.8rem;}
      .empty-state p{font-size:.93rem;}
      .hint{font-size:.8rem;color:var(--mid);margin-top:.7rem;}

      @media(max-width:520px){
        .day-meals{grid-template-columns:1fr;}
        .meal-cell{border-right:none;border-bottom:1px solid var(--warm);}
        .meal-cell:last-child{border-bottom:none;}
        .recipe-grid{grid-template-columns:1fr 1fr;}
        .search-row{flex-direction:column;}
      }
    `}</style>

    <div className="app">
      <div className="header">
        <div className="header-badge">👨‍👩‍👧 Familienkochbuch</div>
        <h1>Kochen für<br />alle zusammen</h1>
        <p>Echte Rezepte aus dem Internet – angepasst an jedes Familienmitglied</p>
      </div>

      <div className="tabs">
        {[["cookbook","📖 Kochbuch"],["plan","📅 Wochenplan"],["profile","👥 Familie"]].map(([id,label])=>(
          <button key={id} className={`tab ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── PROFILE ── */}
      {tab==="profile" && (
        <div>
          <div className="card">
            <h2 className="section-title">👥 Familienmitglieder</h2>
            <p style={{fontSize:".88rem",color:"var(--mid)",marginBottom:"1.2rem"}}>
              Trage alle Personen ein. Die KI berücksichtigt alle Profile und schlägt bei Konflikten automatisch Alternativen vor.
            </p>
            <div className="field-group">
              <label className="field-label">Portionen gesamt</label>
              <div className="number-row">
                <button className="num-btn" onClick={()=>setPeople(p=>Math.max(1,p-1))}>−</button>
                <span className="num-val">{people}</span>
                <button className="num-btn" onClick={()=>setPeople(p=>Math.min(20,p+1))}>+</button>
              </div>
            </div>
          </div>

          {members.map((m,i)=>(
            <MemberEditor key={m.id} member={m}
              color={MEMBER_COLORS[i%MEMBER_COLORS.length]}
              onChange={updated=>updateMember(m.id,updated)}
              onRemove={()=>removeMember(m.id)}
              canRemove={members.length>1} />
          ))}

          <button className="add-member-btn" onClick={addMember}>+ Weitere Person hinzufügen</button>
          <div>
            <button className="primary-btn" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000);}}>
              ✓ Familienprofile speichern
            </button>
            {saved && <span className="saved-badge">✓ Gespeichert!</span>}
          </div>
        </div>
      )}

      {/* ── COOKBOOK ── */}
      {tab==="cookbook" && (
        <>
          <FamilyBar members={members} />
          <div className="card">
            {/* Web Search Toggle */}
            <div className="search-options">
              <div className="toggle-row" onClick={()=>setWebSearch(w=>!w)}>
                <div className={`toggle-track ${webSearch?"on":""}`}>
                  <div className="toggle-thumb" />
                </div>
                <span className={`toggle-label ${webSearch?"on":""}`}>
                  🌐 Internetsuche
                </span>
              </div>
              {webSearch && <span className="web-badge">Live-Rezepte aus dem Web</span>}
            </div>

            <div className="search-row">
              <input className="search-input"
                placeholder="z.B. Pasta, Sonntagsbraten, schnelles Abendessen…"
                value={searchQuery}
                onChange={e=>setSearchQuery(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&generateRecipes()} />
              <button className="primary-btn" onClick={generateRecipes} disabled={loading}>
                {loading?"…":"✨ Generieren"}
              </button>
            </div>
            {getAllIntolerances(members).length>0 && (
              <p className="hint">💡 Rezepte mit Zutatenkonflikten erhalten ein 🔄-Badge mit personalisierten Austauschvorschlägen.</p>
            )}
          </div>

          {loading && <Spinner label={loadingStatus} />}

          {!loading && recipes.length===0 && (
            <div className="empty-state">
              <div className="icon">🍽️</div>
              <p>Klicke auf „Generieren" für {webSearch?"aktuelle Internet-Rezepte":"familiengerechte Rezepte"}.</p>
            </div>
          )}

          {recipes.length>0 && (
            <div className="recipe-grid">
              {recipes.map((r,i)=>(
                <div key={i} className="recipe-tile" onClick={()=>setSelectedRecipe(r)}>
                  {r.substitutions?.length>0 && <span className="subst-badge">🔄 Tausch</span>}
                  <div className="recipe-emoji">{r.emoji}</div>
                  <div className="recipe-name">{r.name}</div>
                  <div className="recipe-meta">
                    <span>⏱ {r.time}m</span>
                    <span>📊 {r.difficulty}</span>
                  </div>
                  <div className="recipe-tags">
                    {r.tags?.slice(0,3).map(t=><span key={t} className="tag">{t}</span>)}
                  </div>
                  {r.source && <span className="web-tile-badge">🌐 {r.source}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PLAN ── */}
      {tab==="plan" && (
        <>
          <FamilyBar members={members} />
          <div className="card">
            <button className="primary-btn" onClick={generatePlan} disabled={planLoading}>
              {planLoading?"Erstelle Plan…":"📅 Familienplan generieren"}
            </button>
            <p className="hint">Berücksichtigt alle {members.length} Familienmitglieder und ihre Unverträglichkeiten.</p>
          </div>

          {planLoading && <Spinner label="Erstelle personalisierten Wochenplan…" />}

          {!planLoading && Object.keys(plan).length===0 && (
            <div className="empty-state">
              <div className="icon">📅</div>
              <p>Generiere deinen personalisierten Familienplan für die ganze Woche.</p>
            </div>
          )}

          {Object.keys(plan).length>0 && (
            <div className="plan-grid">
              {DAYS.map(day=>plan[day]&&(
                <div key={day} className="day-card">
                  <div className="day-header">{day}</div>
                  <div className="day-meals">
                    {MEALS.map(meal=>(
                      <div key={meal} className="meal-cell">
                        <div className="meal-label">{meal}</div>
                        <div className="meal-text">{plan[day][meal]||"–"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>

    {selectedRecipe && (
      <RecipeModal recipe={selectedRecipe} members={members} onClose={()=>setSelectedRecipe(null)} />
    )}
    </>
  );
}


