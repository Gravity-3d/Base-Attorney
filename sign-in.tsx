import { users, User } from './db.tsx';



const signInForm = document.getElementById('sign-in-form') as HTMLFormElement;

const emailInput = document.getElementById('email') as HTMLInputElement;

const passwordInput = document.getElementById('password') as HTMLInputElement;

const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;



signInForm.addEventListener('submit', (e) => {

    e.preventDefault();

    errorMessage.textContent = '';



    const email = emailInput.value;

    const password = passwordInput.value;



    if (!email || !password) {

        errorMessage.textContent = 'Please fill in all fields.';

        return;

    }



    // In a real application, you would send this to a server for validation.

    // The server would then look up the user and compare the hashed password.

    const user = users.find(u => u.email === email);



    if (user && user.passwordHash === password) {

        // Successful login

        // In a real app, you'd set a session token (e.g., in a cookie or localStorage)

        // and redirect the user.

        alert(`Welcome back, ${user.email}!`);

        window.location.href = '/'; // Redirect to home page

    } else {

        // Failed login

        errorMessage.textContent = 'Invalid email or password. Please try again.';

        passwordInput.value = ''; // Clear password field

    }

});