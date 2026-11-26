import { createClient } from '@supabase/supabase-js';

const enabled =
  process.argv.includes('--enable') || process.env.ALLOW_SEED === 'true';

if (!enabled) {
  console.error(
    'Seed script is disabled by default to protect production data.\n' +
      'Run with: npm run seed -- --enable'
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const SAMPLE_QUESTIONS = {
  red: [
    ['What is the chemical symbol for Gold?', 'Au'],
    ['Which planet is known as the Red Planet?', 'Mars'],
    ['In what year did the Titanic sink?', '1912'],
    ['Who painted the Mona Lisa?', 'Leonardo da Vinci'],
    ['What is the largest ocean on Earth?', 'Pacific Ocean'],
    ['How many continents are there on Earth?', '7'],
    ['What is the capital city of Japan?', 'Tokyo'],
    ['Which gas do plants absorb from the atmosphere?', 'Carbon dioxide (CO2)'],
    ['Who wrote the play Romeo and Juliet?', 'William Shakespeare'],
    ['What is the hardest natural substance on Earth?', 'Diamond'],
    ['How many degrees are in a right angle?', '90 degrees'],
    ['Which country is home to the kangaroo?', 'Australia'],
    ['What is the boiling point of water at sea level in Celsius?', '100°C'],
    ['Who was the first person to walk on the Moon?', 'Neil Armstrong'],
    ['What is the square root of 144?', '12'],
  ],
  green: [
    ['What is the powerhouse of the cell?', 'Mitochondria'],
    ['Which river is the longest in South America?', 'Amazon River'],
    ['What is the currency of the United Kingdom?', 'Pound Sterling (GBP)'],
    ['How many players are on a standard soccer team on the field?', '11'],
    ['Which element has the atomic number 1?', 'Hydrogen'],
    ['What is the capital city of Canada?', 'Ottawa'],
    ['Who invented the telephone?', 'Alexander Graham Bell'],
    ['Which mammal is capable of true sustained flight?', 'Bat'],
    ['What is the largest internal organ in the human body?', 'Liver'],
    ['In which city is the Eiffel Tower located?', 'Paris'],
    ['How many sides does a hexagon have?', '6'],
    ['Which instrument has 88 keys?', 'Piano'],
    ['What is the freezing point of water in Fahrenheit?', '32°F'],
    ['Which desert is the largest hot desert in the world?', 'Sahara Desert'],
    ['What is the main language spoken in Brazil?', 'Portuguese'],
  ],
  blue: [
    ['What does HTTP stand for?', 'HyperText Transfer Protocol'],
    ['Which planet is closest to the Sun?', 'Mercury'],
    ['What is the capital city of South Korea?', 'Seoul'],
    ['Who developed the theory of relativity?', 'Albert Einstein'],
    ['How many bones are in the adult human body?', '206'],
    ['Which ocean lies between Europe and North America?', 'Atlantic Ocean'],
    ['What is the chemical formula for table salt?', 'NaCl'],
    ['In what sport would you perform a slam dunk?', 'Basketball'],
    ['Which mountain is the tallest above sea level?', 'Mount Everest'],
    ['What is the smallest prime number?', '2'],
    ['Which country gifted the Statue of Liberty to the USA?', 'France'],
    ['What is the primary gas in Earth’s atmosphere?', 'Nitrogen'],
    ['Who wrote "1984"?', 'George Orwell'],
    ['How many minutes are in 3 hours?', '180 minutes'],
    ['Which blood type is known as the universal red-cell donor?', 'O negative'],
  ],
} as const;

async function main() {
  const rows = (['red', 'green', 'blue'] as const).flatMap((team) =>
    SAMPLE_QUESTIONS[team].map(([question_text, answer_text], idx) => ({
      team,
      question_text,
      answer_text,
      notes: `Sample ${team.toUpperCase()} question #${idx + 1}`,
      question_type: 'oral',
      is_active: true,
    }))
  );

  const { error } = await supabase.from('questions').insert(rows);
  if (error) {
    console.error('Failed to insert sample questions:', error.message);
    process.exit(1);
  }

  console.log(`Inserted ${rows.length} sample questions (15 per team).`);
}

main();

