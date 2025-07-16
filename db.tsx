export interface User {

    uid: string;

    email: string;

    passwordHash: string; // In a real app, never store plain text passwords

}



// In a real application, this would be a database.

// For this example, we're using a simple in-memory array.

// Passwords would be hashed, e.g., with bcrypt. For simplicity, we use plain text.

export const users: User[] = [

    {

        uid: '1a2b3c4d',

        email: 'playerone@example.com',

        passwordHash: 'password123',

    },

    {

        uid: '5e6f7g8h',

        email: 'ace.attorney@example.com',

        passwordHash: 'objection!',

    },

    {

        uid: '9i0j1k2l',

        email: 'judge@example.com',

        passwordHash: 'guilty',

    }

];