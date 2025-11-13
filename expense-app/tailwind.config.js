/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Add custom colors for expense status
        'expense-draft': '#6B7280',
        'expense-submitted': '#3B82F6',
        'expense-approved': '#10B981',
        'expense-rejected': '#EF4444',
        'expense-reimbursed': '#8B5CF6',
      }
    },
  },
  plugins: [],
}
