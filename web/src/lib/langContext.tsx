// Sthamly AI web: bhasha ka context. Poore app mein ek hi sach: chunav, abhi ki bhasha, aur message se badalna.
// useLang() se: choice (jo user ne chuna), lang (abhi ki bhasha: UI aur AI dono), setChoice, observe.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_AUTO_LANG, detectLanguage, readChoice, writeChoice, type LangChoice } from "./lang";
import type { SupportedLanguage } from "./languages";

interface LangValue {
  choice: LangChoice;
  lang: SupportedLanguage;
  setChoice: (choice: LangChoice) => void;
  // Naya message aate hi: auto mein bhasha badalti hai. Is message par jo bhasha lagi, wahi lautati hai.
  observe: (text: string) => SupportedLanguage;
}

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LangChoice>(() => readChoice());
  const [autoLang, setAutoLang] = useState<SupportedLanguage>(DEFAULT_AUTO_LANG);
  // Ref: observe() turant sahi bhasha lautaye, state update ka intezaar na kare.
  const autoRef = useRef<SupportedLanguage>(DEFAULT_AUTO_LANG);
  const choiceRef = useRef<LangChoice>(choice);

  const setChoice = useCallback((next: LangChoice) => {
    choiceRef.current = next;
    setChoiceState(next);
    writeChoice(next);
  }, []);

  const observe = useCallback((text: string): SupportedLanguage => {
    const current = choiceRef.current;
    if (current !== "auto") return current;
    const detected = detectLanguage(text);
    if (detected !== null && detected !== autoRef.current) {
      autoRef.current = detected;
      setAutoLang(detected);
    }
    return autoRef.current;
  }, []);

  const value = useMemo<LangValue>(() => {
    const lang: SupportedLanguage = choice === "auto" ? autoLang : choice;
    return { choice, lang, setChoice, observe };
  }, [choice, autoLang, setChoice, observe]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const value = useContext(LangContext);
  if (value === null) {
    throw new Error("useLang: LangProvider ke andar hona chahiye");
  }
  return value;
}
