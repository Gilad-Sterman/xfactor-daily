import bcrypt from 'bcryptjs';

async function generateHash() {
    const password = 'password123';
    const saltRounds = 12;
    
    try {
        const hash = await bcrypt.hash(password, saltRounds);
        console.log('Password:', password);
        console.log('Hash:', hash);
        
        // Test the hash
        const isValid = await bcrypt.compare(password, hash);
        console.log('Hash validation:', isValid);
        
        // SQL UPDATE statement
        console.log('\n--- SQL UPDATE STATEMENT ---');
        console.log(`UPDATE users SET password_hash = '${hash}' WHERE email IN ('admin@xfactor.co.il', 'learner1@company1.co.il', 'learner2@company1.co.il');`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

generateHash();
