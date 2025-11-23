import { effect, Injectable, signal } from "@angular/core";

export type Theme = "light" | "dark" | "system";

@Injectable({
    providedIn: "root",
})
export class ThemeService {
    private readonly THEME_KEY = "jensify-theme-preference";

    // Signal to track the current active theme
    theme = signal<Theme>("dark");

    constructor() {
        // Load saved preference or default to system
        const savedTheme = localStorage.getItem(this.THEME_KEY) as Theme;
        if (savedTheme) {
            this.theme.set(savedTheme);
        }

        // Effect to apply the theme whenever it changes
        effect(() => {
            const currentTheme = this.theme();
            this.applyTheme(currentTheme);
            localStorage.setItem(this.THEME_KEY, currentTheme);
        });

        // Listen for system preference changes if in system mode
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
            "change",
            (_e) => {
                if (this.theme() === "system") {
                    this.applyTheme("system");
                }
            },
        );
    }

    setTheme(newTheme: Theme) {
        this.theme.set(newTheme);
    }

    toggleTheme() {
        const current = this.theme();
        if (current === "light") {
            this.setTheme("dark");
        } else {
            this.setTheme("light");
        }
    }

    private applyTheme(theme: Theme) {
        const root = document.documentElement;
        const isDark = theme === "dark" ||
            (theme === "system" &&
                window.matchMedia("(prefers-color-scheme: dark)").matches);

        if (isDark) {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
    }
}
