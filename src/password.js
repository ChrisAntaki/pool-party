const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getRandomCharacter() {
    return characters[Math.floor(Math.random() * characters.length)];
}

function generate(length) {
    length = length || 32;

    const password = '';
    for (let i = 0; i < length; i++) {
        password += getRandomCharacter();
    }

    return password;
}

module.exports = {generate};
