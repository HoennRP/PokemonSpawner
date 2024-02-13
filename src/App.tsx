import './App.css';

import { MainClient, TypePokemon } from 'pokenode-ts';
import { useCallback, useState } from 'react';

const api = new MainClient();

const ALL_TYPES =
  ["normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy"];

const language = "en";

const LAST_POKEDEX_NUM = 1025;

function App() {
  const [bbCode, setBBCode] = useState("");

  const [numPokemons, setNumPokemons] = useState(1);
  const [type, setType] = useState("");
  const [tag, setTag] = useState("Your tag");
  const [error, setError] = useState("");

  const handleGenerate = useCallback(async () => {
    setError("");
    setBBCode("Generating...");

    try {
      const trimmedType = type.toLocaleLowerCase().trim();
      if (trimmedType === "") {
        const selected = await selectRandomPokemonFromAll(numPokemons);
        const pokemonInfo = await Promise.all(selected.map(p => getInfoForPokemon(p.name)));
        setBBCode(pokemonInfo.map((p) => generateBBCode(p.name, p.sprite, tag)).join("\n"));
      } else if (ALL_TYPES.includes(trimmedType)) {
        const pokemonOfType = await getAllElligiblePokemonForType(trimmedType, true);
        const selected = selectRandomPokemonFromList(pokemonOfType, numPokemons);
        const pokemonInfo = await Promise.all(selected.map(p => getInfoForPokemon(p.pokemon.name)));
        setBBCode(pokemonInfo.map((p) => generateBBCode(p.name, p.sprite, tag)).join("\n"));
      } else {
        setError(`Invalid type: "${type}", Enter a single type or leave the field empty.`);
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      }
    }
  }, [numPokemons, tag, type]);

  return (
    <>
      <h1>Pokemon BBCode Generator</h1>

      <div>
        <label htmlFor="numPokemons">Number of Pokemon:</label>
        <input
          type="number"
          id="numPokemons"
          value={numPokemons}
          onChange={(e) => setNumPokemons(Number(e.target.value))}
        />
      </div>
      <div>
        <label htmlFor="tag">Tag:</label>
        <input
          type="text"
          id="tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="types">Type:</label>
        <input
          type="text"
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
      </div>

      <div>
        {<button className="button" onClick={handleGenerate}>Generate</button>}
      </div>

      <div className="error">
        {error.length > 0 && <p>ERROR: {error}</p>}
      </div>

      <div>
        <textarea
          value={bbCode}
          readOnly
          rows={10}
          cols={50}
        />
      </div>
    </>
  )
}

const getIdFromUrl = (url: string) => {
  const parts = url.split("/");
  if (parts.length < 2) {
    throw new Error("Invalid URL");
  }
  return Number(parts[parts.length - 2]);
}

const getFinalEvo = async (pokemon: TypePokemon) => {
  const species = await getSpeciesByName(pokemon.pokemon.name);
  const evoChainId = getIdFromUrl(species.evolution_chain.url);

  const evoChain = await api.evolution.getEvolutionChainById(evoChainId);
  const finalEvos = [];
  const chainsToVisit = [...evoChain.chain.evolves_to];
  while (chainsToVisit.length > 0) {
    const chain = chainsToVisit.shift()!;
    if (chain.evolves_to.length > 0) {
      chainsToVisit.push(...chain.evolves_to);
    } else {
      finalEvos.push(chain.species.name);
    }
  }
  if (finalEvos.length === 0) {
    finalEvos.push(pokemon.pokemon.name);
  }
  // We don't really use evoChainId, but it can be useful if we don't want to select from same evo chain
  return { finalEvos, evoChainId };
}

const filterByFinalEvo = async (pokemons: TypePokemon[]) => {
  const finalEvoPromises = pokemons.map(getFinalEvo);
  const finalEvoResults = await Promise.all(finalEvoPromises);

  const finalEvoNames = finalEvoResults.reduce((acc, { finalEvos }) => {
    return acc.concat(...finalEvos);
  }, [] as string[]);
  return pokemons.filter((p) => finalEvoNames.includes(p.pokemon.name));
}

const filterByMiscCriteria = async (toFilterPokemon: TypePokemon[]) => {
  // Make sure to remove alternate forms from the results as well
  const pokemons = toFilterPokemon.filter((p) => getIdFromUrl(p.pokemon.url) <= LAST_POKEDEX_NUM);
  const species = await Promise.all(
    pokemons.map((p) => getSpeciesByName(p.pokemon.name))
  );
  const excluded = species.filter(
    (s) => s.is_legendary || s.is_mythical || s.hatch_counter > 48
  ).map((s) => s.name);

  return pokemons.filter((p) => !excluded.includes(p.pokemon.name));
}

const getAllElligiblePokemonForType = async (type: string, isPrem: boolean) => {
  const res = await api.pokemon.getTypeByName(type);
  const pokemons = await filterByMiscCriteria(res.pokemon);
  if (!isPrem) {
    return pokemons;
  }
  return await filterByFinalEvo(pokemons);
}

const selectRandomPokemonFromList = (pokemons: TypePokemon[], n: number) => {
  const pokemonList = [...pokemons];
  const selected = [];
  if (n > pokemonList.length) {
    throw new Error(`Not enough pokemon that meet the criteria. Only ${pokemonList.length} available`);
  }

  for (let i = 0; i < n; i++) {
    const index = Math.floor(Math.random() * pokemonList.length);
    selected.push(pokemonList.splice(index, 1)[0]);
  }
  return selected;
}

const selectRandomPokemonFromAll = async (n: number) => {
  // Generate n unique random numbers between 1 and LAST_POKEDEX_NUM
  if (n > LAST_POKEDEX_NUM) {
    throw new Error(`Not enough pokemon in the pokedex. Only ${LAST_POKEDEX_NUM} available`);
  }
  const pokedexIds = new Set<number>();
  while (pokedexIds.size < n) {
    pokedexIds.add(Math.floor(Math.random() * LAST_POKEDEX_NUM) + 1);
  }
  const pokemons = await Promise.all(
    Array.from(pokedexIds).map((id) => api.pokemon.getPokemonById(id))
  );
  return pokemons;
}

// Get name and front_default sprite
const getInfoForPokemon = async (pokemonName: string, isShiny?: boolean) => {
  const species = await getSpeciesByName(pokemonName);
  const name = species.names.find(
    (f) => f.language.name === language
  )!.name;
  const res = await api.pokemon.getPokemonByName(pokemonName);
  return { name, sprite: isShiny ? res.sprites.front_shiny : res.sprites.front_default };
}

const getSpeciesByName = async (name: string) => {
  const pokemon = await api.pokemon.getPokemonByName(name);
  return await api.pokemon.getPokemonSpeciesByName(pokemon.species.name);
}

// Add your BBCode Template here
const generateBBCode = (pokemonName: string, spriteUrl: string | null, tag: string) => {
  return `Pokemon: ${pokemonName}\nTag: ${tag}\n[img]${spriteUrl}[/img]\n`;
}

export default App;
