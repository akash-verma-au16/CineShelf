/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/**/*.{js,jsx,ts,tsx}'],
	theme: {
		extend: {
			colors: {
				cs: { 
					bg: '#0a0a0a',
					surface: '#141414',
					elevated: '#1a1a1a',
					border: '#2a2a2a',
					red: '#e50914',
				},
			},
			animation: {
				'slide-up': 'slideUp 0.3s ease-out',
			},
			keyframes: {
				slideUp: {
					'0%': { opacity: '0', transform: 'translate(-50%, 16px)' },
					'100%': { opacity: '1', transform: 'translate(-50%, 0)' },
				},
			},
		},
	},
	plugins: [],
};
