export function toWords(amount: number): string {
    if (amount === 0) return "Zero Only";

    const ones = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    ];

    const tens = [
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
    ];

    function convertToWords(n: number): string {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
        if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convertToWords(n % 100) : "");
        return "";
    }

    let result = "";
    let n = Math.floor(Math.abs(amount));

    if (n >= 10000000) {
        result += convertToWords(Math.floor(n / 10000000)) + " Crore ";
        n %= 10000000;
    }

    if (n >= 100000) {
        result += convertToWords(Math.floor(n / 100000)) + " Lakh ";
        n %= 100000;
    }

    if (n >= 1000) {
        result += convertToWords(Math.floor(n / 1000)) + " Thousand ";
        n %= 1000;
    }

    if (n > 0) {
        result += convertToWords(n);
    }

    return result.trim() + " Only";
}
