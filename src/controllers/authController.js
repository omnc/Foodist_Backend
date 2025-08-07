const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const users =[];

exports.register = (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    users.push({ name, email, password });
    res.status(201).json({message:'User registered successfully.'});
}

exports.login = (req, res) => {
    const { name, email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({message:'Invalid Credentials'});
    }
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.json(token);
}