import { NEW_CATEGORIES_CONFIG, Category, SubCategory } from './categories';

interface CategoryMatch {
  gender: string;
  category: string;
  subcategory: string | null;
  confidence: number; // 0 to 1
}

const GENDER_KEYWORDS: Record<string, string> = {
  'mujer': 'Mujer',
  'dama': 'Mujer',
  'senora': 'Mujer',
  'hombre': 'Hombre',
  'caballero': 'Hombre',
  'nino': 'Niños, Niñas y Bebés', // Updated to match config key
  'nina': 'Niños, Niñas y Bebés',
  'infantil': 'Niños, Niñas y Bebés', 
  'bebe': 'Niños, Niñas y Bebés',
};

// Map keywords to semantic category concepts
// Then we map concept + gender to actual Category ID
const KEYWORD_CONCEPTS: Record<string, string> = {
  'tenis': 'Calzado',
  'zapatos': 'Calzado',
  'botas': 'Calzado',
  'sandalias': 'Calzado',
  'tacones': 'Calzado',
  'sneakers': 'Calzado',
  
  'gorra': 'Accesorios:cabeza',
  'sombrero': 'Accesorios:cabeza',
  'beanie': 'Accesorios:cabeza',
  'visera': 'Accesorios:cabeza',
  
  'lentes': 'Accesorios:lentes',
  'gafas': 'Accesorios:lentes',
  
  'reloj': 'Accesorios:complementos',
  'cartera': 'Accesorios:complementos',
  'cinturon': 'Accesorios:complementos',
  'corbata': 'Accesorios:complementos',
  'joyeria': 'Accesorios:complementos',
  'collar': 'Accesorios:complementos',
  'arete': 'Accesorios:complementos',
  'anillo': 'Accesorios:complementos',
  'bolso': 'Accesorios:complementos',
  'mochila': 'Accesorios:complementos',
  'maletin': 'Accesorios:complementos',
  
  'cobija': 'Hogar:Textiles y Blancos:recamara',
  'edredon': 'Hogar:Textiles y Blancos:recamara',
  'sabana': 'Hogar:Textiles y Blancos:recamara',
  'cobertor': 'Hogar:Textiles y Blancos:recamara',
  'funda': 'Hogar:Textiles y Blancos:recamara',
  
  'cojin': 'Hogar:Textiles y Blancos:decoracion',
  'alfombra': 'Hogar:Textiles y Blancos:decoracion',
  'cortina': 'Hogar:Textiles y Blancos:decoracion',
  
  'toalla': 'Hogar:Textiles y Blancos:bano',
  'bata': 'Hogar:Textiles y Blancos:bano',
  'tapete': 'Hogar:Textiles y Blancos:bano',
  
  'mantel': 'Hogar:Textiles y Blancos:mesa_cocina',
  'camino': 'Hogar:Textiles y Blancos:mesa_cocina', // camino de mesa
  'servilleta': 'Hogar:Textiles y Blancos:mesa_cocina',
  
  'blusa': 'Blusas',
  'top': 'Tops y Bodies',
  'body': 'Tops y Bodies',
  'playera': 'Playeras',
  'tshirt': 'Playeras',
  'camiseta': 'Playeras',
  
  'sueter': 'Sueter', // Generic
  'cardigan': 'Sueter',
  'sudadera': 'Sudaderas',
  'hoodie': 'Sudaderas',
  
  'pantalon': 'Pantalones',
  'jeans': 'Jeans',
  'mezclilla': 'Jeans',
  'legging': 'Leggings',
  'malla': 'Leggings',
  
  'falda': 'Faldas',
  'vestido': 'Vestidos',
  
  'short': 'Shorts y Bermudas',
  'bermuda': 'Shorts y Bermudas',
  
  'chamarra': 'Chamarras', // or Chamarra singular
  'jacket': 'Chamarras',
  'abrigo': 'Abrigos y Gabardinas',
  'gabardina': 'Abrigos y Gabardinas',
  'chaleco': 'Chalecos',
  
  'saco': 'Sacos y Blazers',
  'blazer': 'Sacos y Blazers',
  
  'overol': 'Overoles y Jumpers',
  'jumper': 'Overoles y Jumpers',
  
  'lenceria': 'Lenceria',
  'calzon': 'Lenceria',
  'brasier': 'Lenceria',
  'pijama': 'Pijamas',
  
  'camisa': 'Camisas',
  'traje': 'Trajes',
  'jersey': 'Jerseys',
  
  'polo': 'Polos',
  'tank': 'Tanks',
  'jogger': 'Joggers y Pants',

  // ALIMENTOS Y BEBIDAS
  // Despensa
  'arroz': 'Alimentos y Bebidas:Despensa y Abarrotes:Arroz y Granos',
  'frijol': 'Alimentos y Bebidas:Despensa y Abarrotes:Arroz y Granos',
  'pasta': 'Alimentos y Bebidas:Despensa y Abarrotes:Arroz y Granos', // Fixed mapping
  'atun': 'Alimentos y Bebidas:Despensa y Abarrotes:Enlatados',
  'sardina': 'Alimentos y Bebidas:Despensa y Abarrotes:Enlatados',
  'aceite': 'Alimentos y Bebidas:Despensa y Abarrotes:Aceites',
  'vinagre': 'Alimentos y Bebidas:Despensa y Abarrotes:Aceites',
  'harina': 'Alimentos y Bebidas:Despensa y Abarrotes:Harinas',
  'azucar': 'Alimentos y Bebidas:Despensa y Abarrotes:Harinas',
  
  // Desayuno
  'cereal': 'Alimentos y Bebidas:Desayuno y Panadería:Cereales',
  'avena': 'Alimentos y Bebidas:Desayuno y Panadería:Cereales',
  'galleta': 'Alimentos y Bebidas:Desayuno y Panadería:Panaderia',
  'pan': 'Alimentos y Bebidas:Desayuno y Panadería:Panaderia',
  'mermelada': 'Alimentos y Bebidas:Desayuno y Panadería:Untables',
  'nutella': 'Alimentos y Bebidas:Desayuno y Panadería:Untables',
  
  // Bebidas
  'agua': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Aguas',
  'refresco': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Aguas',
  'jugo': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Jugos',
  'cafe': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Cafe y Te',
  'te': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Cafe y Te',
  'gatorade': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Energizantes',
  'red bull': 'Alimentos y Bebidas:Bebidas (Sin Alcohol):Energizantes',
  
  // Alcohol (Updated)
  'cerveza': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Cervezas',
  'chela': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Cervezas',
  'beer': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Cervezas',
  'vino': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Vinos',
  'tequila': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Tequila y Mezcal',
  'whisky': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Whisky y Vodka',
  'vodka': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Whisky y Vodka',
  'ron': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Ron y Brandy',
  'mezcal': 'Alimentos y Bebidas:Vinos, Licores y Cervezas:Tequila y Mezcal',
  
  // Snacks
  'papas': 'Alimentos y Bebidas:Snacks y Dulces:Botanas',
  'palomitas': 'Alimentos y Bebidas:Snacks y Dulces:Botanas',
  'dulces': 'Alimentos y Bebidas:Snacks y Dulces:Dulces',
  'chocolate': 'Alimentos y Bebidas:Snacks y Dulces:Chocolates',
  'almendra': 'Alimentos y Bebidas:Snacks y Dulces:Frutos Secos',
  'nuez': 'Alimentos y Bebidas:Snacks y Dulces:Frutos Secos',
  
  // Saludable
  'chia': 'Alimentos y Bebidas:Mundo Saludable:Organico',
  'matcha': 'Alimentos y Bebidas:Mundo Saludable:Organico',
  'gluten free': 'Alimentos y Bebidas:Mundo Saludable:Sin Gluten',
  'keto': 'Alimentos y Bebidas:Mundo Saludable:Keto',
  'vegano': 'Alimentos y Bebidas:Mundo Saludable:Vegano',
  
  // OTROS
  'vibrador': 'Otros:Adultos:Juguetes',
  'dildo': 'Otros:Adultos:Juguetes',
  'lubricante': 'Otros:Adultos:Lubricantes',

  // DEPORTES
  'pesa': 'Deportes y Aire Libre:Fitness:Pesas',
  'mancuerna': 'Deportes y Aire Libre:Fitness:Pesas',
  'caminadora': 'Deportes y Aire Libre:Fitness:Cardio',
  'bicicleta': 'Deportes y Aire Libre:Ciclismo:Bicicletas',
  'casco bici': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',
  'balon': 'Deportes y Aire Libre:Deportes Equipo:Futbol',
  'raqueta': 'Deportes y Aire Libre:Raqueta:Tenis',

  // AUTOMOTRIZ
  'llanta': 'Automotriz y Motocicletas:Llantas:Llantas',
  'neumatico': 'Automotriz y Motocicletas:Llantas:Llantas',
  'rin': 'Automotriz y Motocicletas:Llantas:Rines',
  'casco moto': 'Automotriz y Motocicletas:Motos:Equipamiento Moto',
  'bateria auto': 'Automotriz y Motocicletas:Refacciones Auto:Electrico',

  // RESTRINGIDOS (Solo Tiendas Oficiales)
  'guia prepagada': 'Otros:Restringidos:Guias',
  'guia envio': 'Otros:Restringidos:Guias',
  'estafeta': 'Otros:Restringidos:Guias',
  'fedex': 'Otros:Restringidos:Guias',
  'dhl': 'Otros:Restringidos:Guias',
  
  'windows': 'Otros:Restringidos:Software',
  'office': 'Otros:Restringidos:Software',
  'antivirus': 'Otros:Restringidos:Software',
  'adobe': 'Otros:Restringidos:Software',
  'licencia': 'Otros:Restringidos:Software',
  'software': 'Otros:Restringidos:Software',
  
  'netflix': 'Otros:Restringidos:Suscripciones',
  'spotify': 'Otros:Restringidos:Suscripciones',
  'disney': 'Otros:Restringidos:Suscripciones',
  'hbo': 'Otros:Restringidos:Suscripciones',
  'game pass': 'Otros:Restringidos:Suscripciones',
  'psn': 'Otros:Restringidos:Suscripciones',
  'suscripcion': 'Otros:Restringidos:Suscripciones',

  // Computacion
  'laptop': 'Electrónica y Tecnología:Computación (Informática):Laptops Tradicionales',
  'macbook': 'Electrónica y Tecnología:Computación (Informática):MacBooks',
  'notebook': 'Electrónica y Tecnología:Computación (Informática):Laptops Tradicionales',
  'pc gamer': 'Electrónica y Tecnología:Computación (Informática):PC Gamer',
  'computadora escritorio': 'Electrónica y Tecnología:Computación (Informática):All-in-One',
  'monitor': 'Electrónica y Tecnología:Computación (Informática):Monitores',
  'teclado': 'Electrónica y Tecnología:Computación (Informática):Teclados y Mouses',
  'mouse': 'Electrónica y Tecnología:Computación (Informática):Teclados y Mouses',
  'raton': 'Electrónica y Tecnología:Computación (Informática):Teclados y Mouses',
  'webcam': 'Electrónica y Tecnología:Computación (Informática):Webcams',
  'disco duro': 'Electrónica y Tecnología:Computación (Informática):Discos Duros y SSD',
  'ssd': 'Electrónica y Tecnología:Computación (Informática):Discos Duros y SSD',
  'memoria ram': 'Electrónica y Tecnología:Computación (Informática):Memorias RAM',
  'procesador': 'Electrónica y Tecnología:Computación (Informática):Procesadores',
  'cpu': 'Electrónica y Tecnología:Computación (Informática):Procesadores',
  'tarjeta video': 'Electrónica y Tecnología:Computación (Informática):Tarjetas de Video',
  'gpu': 'Electrónica y Tecnología:Computación (Informática):Tarjetas de Video',
  'motherboard': 'Electrónica y Tecnología:Computación (Informática):Tarjetas Madre',
  'tarjeta madre': 'Electrónica y Tecnología:Computación (Informática):Tarjetas Madre',
  'memoria usb': 'Electrónica y Tecnología:Computación (Informática):Memorias USB',
  'pendrive': 'Electrónica y Tecnología:Computación (Informática):Memorias USB',
  'micro sd': 'Electrónica y Tecnología:Computación (Informática):Tarjetas de Memoria',
  'router': 'Electrónica y Tecnología:Computación (Informática):Routers y Módems',
  'modem': 'Electrónica y Tecnología:Computación (Informática):Routers y Módems',
  'repetidor wifi': 'Electrónica y Tecnología:Computación (Informática):Repetidores de Señal',
  'cable ethernet': 'Electrónica y Tecnología:Computación (Informática):Cables de Red',

   // TV, Audio y Video
   'smart tv': 'Electrónica y Tecnología:TV, Audio y Video:Smart TVs',
   'televisor': 'Electrónica y Tecnología:TV, Audio y Video:Smart TVs',
   'pantalla': 'Electrónica y Tecnología:TV, Audio y Video:Smart TVs',
   'roku': 'Electrónica y Tecnología:TV, Audio y Video:Dispositivos de Streaming',
   'chromecast': 'Electrónica y Tecnología:TV, Audio y Video:Dispositivos de Streaming',
   'fire tv': 'Electrónica y Tecnología:TV, Audio y Video:Dispositivos de Streaming',
   'apple tv': 'Electrónica y Tecnología:TV, Audio y Video:Dispositivos de Streaming',
   'audifonos': 'Electrónica y Tecnología:TV, Audio y Video:Audífonos',
   'auriculares': 'Electrónica y Tecnología:TV, Audio y Video:Audífonos',
   'airpods': 'Electrónica y Tecnología:TV, Audio y Video:Audífonos',
   'galaxy buds': 'Electrónica y Tecnología:TV, Audio y Video:Audífonos',
   'bocina': 'Electrónica y Tecnología:TV, Audio y Video:Bocinas Portátiles',
   'parlante': 'Electrónica y Tecnología:TV, Audio y Video:Bocinas Portátiles',
   'jbl': 'Electrónica y Tecnología:TV, Audio y Video:Bocinas Portátiles',
   'alexa': 'Electrónica y Tecnología:TV, Audio y Video:Asistentes de Voz',
   'echo dot': 'Electrónica y Tecnología:TV, Audio y Video:Asistentes de Voz',
   'google home': 'Electrónica y Tecnología:TV, Audio y Video:Asistentes de Voz',
   'proyector': 'Electrónica y Tecnología:TV, Audio y Video:Proyectores',
   'barra sonido': 'Electrónica y Tecnología:TV, Audio y Video:Barras de Sonido',
   'soundbar': 'Electrónica y Tecnología:TV, Audio y Video:Barras de Sonido',

   // Cámaras y Fotografía
   'camara': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras DSLR',
   'dslr': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras DSLR',
   'reflex': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras DSLR',
   'mirrorless': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras Mirrorless',
   'gopro': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras de Acción',
   'action cam': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras de Acción',
   'instax': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras Instantáneas',
   'polaroid': 'Electrónica y Tecnología:Cámaras y Fotografía:Cámaras Instantáneas',
   'dron': 'Electrónica y Tecnología:Cámaras y Fotografía:Drones con cámara',
   'drone': 'Electrónica y Tecnología:Cámaras y Fotografía:Drones con cámara',
   'dji': 'Electrónica y Tecnología:Cámaras y Fotografía:Drones con cámara',
   'lente camara': 'Electrónica y Tecnología:Cámaras y Fotografía:Objetivos',
   'objetivo': 'Electrónica y Tecnología:Cámaras y Fotografía:Objetivos',
   'tripie': 'Electrónica y Tecnología:Cámaras y Fotografía:Tripiés y Estabilizadores',
   'estabilizador': 'Electrónica y Tecnología:Cámaras y Fotografía:Tripiés y Estabilizadores',
   'gimbal': 'Electrónica y Tecnología:Cámaras y Fotografía:Tripiés y Estabilizadores',
   'aro luz': 'Electrónica y Tecnología:Cámaras y Fotografía:Iluminación de Estudio',

   // Videojuegos
  'consola': 'Electrónica y Tecnología:Videojuegos (Gaming):PlayStation',
  'playstation': 'Electrónica y Tecnología:Videojuegos (Gaming):PlayStation',
  'ps5': 'Electrónica y Tecnología:Videojuegos (Gaming):PlayStation',
  'ps4': 'Electrónica y Tecnología:Videojuegos (Gaming):PlayStation',
  'xbox': 'Electrónica y Tecnología:Videojuegos (Gaming):Xbox',
  'xbox one': 'Electrónica y Tecnología:Videojuegos (Gaming):Xbox',
  'xbox series': 'Electrónica y Tecnología:Videojuegos (Gaming):Xbox',
  'nintendo': 'Electrónica y Tecnología:Videojuegos (Gaming):Nintendo',
  'switch': 'Electrónica y Tecnología:Videojuegos (Gaming):Nintendo',
  'wii': 'Electrónica y Tecnología:Videojuegos (Gaming):Nintendo',
  'control ps4': 'Electrónica y Tecnología:Videojuegos (Gaming):Accesorios',
  'control xbox': 'Electrónica y Tecnología:Videojuegos (Gaming):Accesorios',
  'joycon': 'Electrónica y Tecnología:Videojuegos (Gaming):Accesorios',
  'videojuego': 'Electrónica y Tecnología:Videojuegos (Gaming):Videojuegos',
  'juego ps4': 'Electrónica y Tecnología:Videojuegos (Gaming):Videojuegos',
  'juego xbox': 'Electrónica y Tecnología:Videojuegos (Gaming):Videojuegos',
  'juego switch': 'Electrónica y Tecnología:Videojuegos (Gaming):Videojuegos',

   // HOGAR, MUEBLES Y JARDÍN
   // Muebles
   'sofa': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Sofás y Sillones',
   'sillon': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Sofás y Sillones',
   'sala': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Sofás y Sillones',
   'mesa centro': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Mesas de Centro',
   'mesa lateral': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Mesas de Centro',
   'mueble tv': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Muebles TV',
   'centro entretenimiento': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Muebles TV',
   'puff': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Puffs',
   'taburete': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Puffs',
   'cama': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Camas y Bases',
   'base cama': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Camas y Bases',
   'colchon': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Colchones',
   'cabecera': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Cabeceras',
   'buro': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Burós y Cómodas',
   'comoda': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Burós y Cómodas',
   'cajonera': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Burós y Cómodas',
   'armario': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Armarios',
   'ropero': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Armarios',
   'closet': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Armarios',
   'comedor': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Juegos de Comedor',
   'juego comedor': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Juegos de Comedor',
   'mesa': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Mesas y Sillas',
   'silla': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Mesas y Sillas',
   'bufetera': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Bufeteras',
   'trinchador': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Bufeteras',
   'escritorio': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Escritorios',
   'silla oficina': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Sillas Oficina',
   'archivero': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Archiveros',
   'librero': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Archiveros',
   'estante': 'Hogar, Jardín y Herramientas:Muebles y Organización (Hogar):Archiveros',

   // Cocina
   'olla': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Ollas y Cacerolas',
   'cacerola': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Ollas y Cacerolas',
   'sarten': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Sartenes y Woks',
   'wok': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Sartenes y Woks',
   'olla presion': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Ollas Presión',
   'express': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Ollas Presión',
   'molde hornear': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Moldes Hornear',
   'refractario': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Moldes Hornear',
   'vajilla': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Juegos de Vajilla',
   'plato': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Juegos de Vajilla',
   'vaso': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Vasos y Copas',
   'copa': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Vasos y Copas',
   'jarra': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Vasos y Copas',
   'cubiertos': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cubiertos',
   'tenedor': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cubiertos',
   'cuchara': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cubiertos',
   'mantel': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Servilletas Manteles',
   'servilleta': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Servilletas Manteles',
   'cuchillo cocina': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cuchillos Tablas',
   'tabla picar': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cuchillos Tablas',
   'tupper': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Recipientes',
   'hermetico': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Recipientes',
   'organizador cocina': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Organizadores Cocina',
   'escurridor': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Organizadores Cocina',
   'termo': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Termos',
   'botella agua': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Termos',
   'cafetera': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cafeteras',
   'prensa francesa': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Cafeteras',
   'tetera': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Teteras',
   'molinillo': 'Hogar, Jardín y Herramientas:Cocina y Mesa (Bazar):Molinillos',

   // Decoración
   'lampara': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Lámparas Techo',
   'candil': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Lámparas Techo',
   'foco': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Focos',
   'bombilla': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Focos',
   'tira led': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Tiras LED',
   'espejo': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Espejos',
   'cuadro': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Cuadros',
   'marco': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Cuadros',
   'reloj pared': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Relojes Pared',
   'vinilo': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Vinilos',
   'papel tapiz': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Vinilos',
   'cortina': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Cortinas',
   'persiana': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Cortinas',
   'alfombra': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Alfombras',
   'tapete': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Alfombras',
   'cojin': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Cojines',
   'difusor': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Difusores',
   'aroma': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Difusores',
   'vela': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Velas',
   'candelabro': 'Hogar, Jardín y Herramientas:Decoración e Iluminación:Velas',

   // Cama y Baño
   'sabana': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Sábanas',
   'edredon': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Edredones',
   'duvet': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Edredones',
   'cobija': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Edredones',
   'almohada': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Almohadas',
   'toalla': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Toallas',
   'cortina bano': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Cortinas Baño',
   'jabonera': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Accesorios Baño',
   'dispensador': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Accesorios Baño',
   'tapete bano': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Tapetes Baño',
   'cesto ropa': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Cestos',
   'tendedero': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Tendederos',
   'gancho': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Tendederos',
   'tabla planchar': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Tablas Planchar',
   'escoba': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Artículos Limpieza',
   'trapeador': 'Hogar, Jardín y Herramientas:Cama, Baño y Limpieza:Artículos Limpieza',

   // Jardín y Aire Libre
   'sala jardin': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Salas Exterior',
   'comedor jardin': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Comedores Jardín',
   'hamaca': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Hamacas',
   'tumbona': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Hamacas',
   'sombrilla': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Sombrillas',
   'toldo': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Sombrillas',
   'asador': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Asadores Carbón',
   'parrilla': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Asadores Carbón',
   'ahumador': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Ahumadores',
   'maceta': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Macetas',
   'planta': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Plantas',
   'manguera': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Riego',
   'cortadora cesped': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Cortadoras',
   'alberca': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Albercas',
   'inflable': 'Hogar, Jardín y Herramientas:Jardín y Aire Libre:Inflables Agua',

   // HERRAMIENTAS Y CONSTRUCCIÓN
   // Eléctricas
   'taladro': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Taladros',
   'atornillador': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Taladros',
   'sierra': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Sierras',
   'lijadora': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Lijadoras',
   'esmeriladora': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Esmeriladoras',
   'pulidora': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Esmeriladoras',
   'soldadora': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Soldadoras',

   // Manuales
   'juego herramientas': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Kits Herramientas',
   'kit herramientas': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Kits Herramientas',
   'llave': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Desarmadores',
   'desarmador': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Desarmadores',
   'pinza': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Alicates',
   'alicate': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Alicates',
   'martillo': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Martillos',
   'mazo': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Martillos',
   'medicion': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Medición',
   'flexometro': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Medición',
   'cinta metrica': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Medición',

   // Ferretería
   'grifo': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Grifería',
   'mezcladora': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Grifería',
   'regadera': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Regaderas',
   'tornillo': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Tornillos',
   'clavo': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Tornillos',
   'taquete': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Tornillos',
   'cerradura': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cerraduras',
   'chapa': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cerraduras',
   'candado': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cerraduras',
   'bomba agua': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Bombas Agua',

   // Electricidad
   'cable electrico': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cableado',
   'interruptor': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Interruptores',
   'enchufe': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Interruptores',
   'contacto': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Interruptores',

   // Seguridad
   'zapato seguridad': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Zapatos Seguridad',
   'bota industrial': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Zapatos Seguridad',
   'casco': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cascos Lentes',
   'lentes seguridad': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cascos Lentes',
   'guantes': 'Hogar, Jardín y Herramientas:Herramientas y Mejoras:Cascos Lentes',
  'carcasa': 'Electrónica y Tecnología:Celulares y Telefonía:Fundas y Carcasas',
  'carcasas': 'Electrónica y Tecnología:Celulares y Telefonía:Fundas y Carcasas',
  'impresora 3d': 'Electrónica y Tecnología:Electrónica de Oficina:Impresoras 3D',
  'impresoras 3d': 'Electrónica y Tecnología:Electrónica de Oficina:Impresoras 3D',

  // BELLEZA Y CUIDADO PERSONAL
  // Cuidado de la Piel
  'limpiador facial': 'Belleza y Salud:Cuidado de la Piel (Skincare):Limpiadores',
  'desmaquillante': 'Belleza y Salud:Cuidado de la Piel (Skincare):Limpiadores',
  'agua micelar': 'Belleza y Salud:Cuidado de la Piel (Skincare):Limpiadores',
  'tonico facial': 'Belleza y Salud:Cuidado de la Piel (Skincare):Tonicos',
  'serum': 'Belleza y Salud:Cuidado de la Piel (Skincare):Serums',
  'suero facial': 'Belleza y Salud:Cuidado de la Piel (Skincare):Serums',
  'crema facial': 'Belleza y Salud:Cuidado de la Piel (Skincare):Cremas',
  'crema hidratante': 'Belleza y Salud:Cuidado de la Piel (Skincare):Cremas',
  'contorno ojos': 'Belleza y Salud:Cuidado de la Piel (Skincare):Ojos',
  'crema ojos': 'Belleza y Salud:Cuidado de la Piel (Skincare):Ojos',
  'mascarilla facial': 'Belleza y Salud:Cuidado de la Piel (Skincare):Mascarillas',
  'sheet mask': 'Belleza y Salud:Cuidado de la Piel (Skincare):Mascarillas',
  'exfoliante': 'Belleza y Salud:Cuidado de la Piel (Skincare):Exfoliantes',
  'bloqueador solar': 'Belleza y Salud:Cuidado de la Piel (Skincare):Proteccion Solar',
  'protector solar': 'Belleza y Salud:Cuidado de la Piel (Skincare):Proteccion Solar',
  'crema corporal': 'Belleza y Salud:Cuidado de la Piel (Skincare):Cuerpo',
  'locion corporal': 'Belleza y Salud:Cuidado de la Piel (Skincare):Cuerpo',

  // Maquillaje
  'base maquillaje': 'Belleza y Salud:Maquillaje:Bases',
  'corrector maquillaje': 'Belleza y Salud:Maquillaje:Bases',
  'polvo compacto': 'Belleza y Salud:Maquillaje:Polvos',
  'rubor': 'Belleza y Salud:Maquillaje:Polvos',
  'blush': 'Belleza y Salud:Maquillaje:Polvos',
  'iluminador': 'Belleza y Salud:Maquillaje:Iluminadores',
  'bronzer': 'Belleza y Salud:Maquillaje:Iluminadores',
  'sombra ojos': 'Belleza y Salud:Maquillaje:Ojos',
  'delineador': 'Belleza y Salud:Maquillaje:Ojos',
  'rimel': 'Belleza y Salud:Maquillaje:Ojos',
  'mascara pestañas': 'Belleza y Salud:Maquillaje:Ojos',
  'labial': 'Belleza y Salud:Maquillaje:Labios',
  'balsamo labial': 'Belleza y Salud:Maquillaje:Labios',
  'brochas maquillaje': 'Belleza y Salud:Maquillaje:Brochas',
  'esponja maquillaje': 'Belleza y Salud:Maquillaje:Brochas',

  // Cabello
  'shampoo': 'Belleza y Salud:Cuidado del Cabello:Shampoo',
  'acondicionador': 'Belleza y Salud:Cuidado del Cabello:Shampoo',
  'tratamiento cabello': 'Belleza y Salud:Cuidado del Cabello:Tratamientos',
  'mascarilla cabello': 'Belleza y Salud:Cuidado del Cabello:Tratamientos',
  'tinte cabello': 'Belleza y Salud:Cuidado del Cabello:Coloracion',
  'gel cabello': 'Belleza y Salud:Cuidado del Cabello:Peinado',
  'spray cabello': 'Belleza y Salud:Cuidado del Cabello:Peinado',
  'secadora cabello': 'Belleza y Salud:Cuidado del Cabello:Herramientas',
  'plancha cabello': 'Belleza y Salud:Cuidado del Cabello:Herramientas',
  'rizadora': 'Belleza y Salud:Cuidado del Cabello:Herramientas',

  // Perfumes
  'perfume mujer': 'Belleza y Salud:Perfumes y Fragancias:Mujer',
  'perfume hombre': 'Belleza y Salud:Perfumes y Fragancias:Hombre',
  'fragancia': 'Belleza y Salud:Perfumes y Fragancias:Unisex',
  'body mist': 'Belleza y Salud:Perfumes y Fragancias:Body Mists',

  // Higiene Personal
  'pasta dientes': 'Belleza y Salud:Cuidado Personal e Higiene:Bucal',
  'cepillo dientes': 'Belleza y Salud:Cuidado Personal e Higiene:Bucal',
  'enjuague bucal': 'Belleza y Salud:Cuidado Personal e Higiene:Bucal',
  'desodorante': 'Belleza y Salud:Cuidado Personal e Higiene:Desodorantes',
  'antitranspirante': 'Belleza y Salud:Cuidado Personal e Higiene:Desodorantes',
  'rastrillo': 'Belleza y Salud:Cuidado Personal e Higiene:Afeitado',
  'crema afeitar': 'Belleza y Salud:Cuidado Personal e Higiene:Afeitado',
  'cera depilar': 'Belleza y Salud:Cuidado Personal e Higiene:Afeitado',
  'toallas femeninas': 'Belleza y Salud:Cuidado Personal e Higiene:Higiene Fem',
  'tampones': 'Belleza y Salud:Cuidado Personal e Higiene:Higiene Fem',
  'esmalte uñas': 'Belleza y Salud:Cuidado Personal e Higiene:Uñas',
  'acetona': 'Belleza y Salud:Cuidado Personal e Higiene:Uñas',

  // Salud
  'vitaminas': 'Belleza y Salud:Salud y Bienestar:Vitaminas',
  'suplementos': 'Belleza y Salud:Salud y Bienestar:Vitaminas',
  'proteina polvo': 'Belleza y Salud:Salud y Bienestar:Vitaminas',
  'botiquin': 'Belleza y Salud:Salud y Bienestar:Botiquin',
  'curitas': 'Belleza y Salud:Salud y Bienestar:Botiquin',
  'vendas': 'Belleza y Salud:Salud y Bienestar:Botiquin',
  'alcohol etilico': 'Belleza y Salud:Salud y Bienestar:Botiquin',
  'baumanometro': 'Belleza y Salud:Salud y Bienestar:Equipo Medico',
  'oximetro': 'Belleza y Salud:Salud y Bienestar:Equipo Medico',
  'termometro': 'Belleza y Salud:Salud y Bienestar:Equipo Medico',
  'silla ruedas': 'Belleza y Salud:Salud y Bienestar:Ortopedia',
  'muletas': 'Belleza y Salud:Salud y Bienestar:Ortopedia',
  'faja lumbar': 'Belleza y Salud:Salud y Bienestar:Ortopedia',

  // DEPORTES Y FITNESS
  // Fitness
  'caminadora': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Cardio',
  'eliptica': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Cardio',
  'bicicleta fija': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Cardio',
  'pesas': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Pesas',
  'mancuernas': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Pesas',
  'barra pesas': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Pesas',
  'disco pesas': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Pesas',
  'tapete yoga': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Funcional',
  'ligas resistencia': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Funcional',
  'cuerda saltar': 'Deportes y Aire Libre:Fitness y Musculación (Gym en Casa):Funcional',

  // Ciclismo
  'bicicleta': 'Deportes y Aire Libre:Ciclismo:Bicicletas',
  'bici': 'Deportes y Aire Libre:Ciclismo:Bicicletas',
  'casco bicicleta': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',
  'luces bicicleta': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',
  'candado bicicleta': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',
  'refacciones bicicleta': 'Deportes y Aire Libre:Ciclismo:Componentes Bici',
  'llanta bicicleta': 'Deportes y Aire Libre:Ciclismo:Componentes Bici',
  'jersey ciclismo': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',

  // Deportes Equipo
  'balon futbol': 'Deportes y Aire Libre:Deportes de Equipo:Futbol',
  'zapatos futbol': 'Deportes y Aire Libre:Deportes de Equipo:Futbol',
  'guantes portero': 'Deportes y Aire Libre:Deportes de Equipo:Futbol',
  'balon basket': 'Deportes y Aire Libre:Deportes de Equipo:Basket',
  'canasta basket': 'Deportes y Aire Libre:Deportes de Equipo:Basket',
  'bate beisbol': 'Deportes y Aire Libre:Deportes de Equipo:Beisbol',
  'guante beisbol': 'Deportes y Aire Libre:Deportes de Equipo:Beisbol',
  'pelota beisbol': 'Deportes y Aire Libre:Deportes de Equipo:Beisbol',
  'balon voleibol': 'Deportes y Aire Libre:Deportes de Equipo:Voleibol',
  'red voleibol': 'Deportes y Aire Libre:Deportes de Equipo:Voleibol',
  'balon americano': 'Deportes y Aire Libre:Deportes de Equipo:Fut Americano',

  // Camping
  'casa campaña': 'Deportes y Aire Libre:Camping, Caza y Pesca:Camping',
  'sleeping bag': 'Deportes y Aire Libre:Camping, Caza y Pesca:Camping',
  'bolsa dormir': 'Deportes y Aire Libre:Camping, Caza y Pesca:Camping',
  'mochila camping': 'Deportes y Aire Libre:Camping, Caza y Pesca:Camping',
  'hielera': 'Deportes y Aire Libre:Camping, Caza y Pesca:Camping',
  'caña pescar': 'Deportes y Aire Libre:Camping, Caza y Pesca:Pesca',
  'carrete pesca': 'Deportes y Aire Libre:Camping, Caza y Pesca:Pesca',
  'anzuelos': 'Deportes y Aire Libre:Camping, Caza y Pesca:Pesca',

  // Raqueta
  'raqueta tenis': 'Deportes y Aire Libre:Deportes de Raqueta:Tenis',
  'pelotas tenis': 'Deportes y Aire Libre:Deportes de Raqueta:Tenis',
  'pala padel': 'Deportes y Aire Libre:Deportes de Raqueta:Padel',
  'raqueta fronton': 'Deportes y Aire Libre:Deportes de Raqueta:Squash',

  // Acuáticos
  'goggles natacion': 'Deportes y Aire Libre:Deportes Acuáticos:Natacion',
  'gorra natacion': 'Deportes y Aire Libre:Deportes Acuáticos:Natacion',
  'tabla surf': 'Deportes y Aire Libre:Deportes Acuáticos:Surf',
  'aletas buceo': 'Deportes y Aire Libre:Deportes Acuáticos:Buceo',
  'visor buceo': 'Deportes y Aire Libre:Deportes Acuáticos:Buceo',
  'snorkel': 'Deportes y Aire Libre:Deportes Acuáticos:Buceo',

  // Patines
  'patines': 'Deportes y Aire Libre:Patines, Skate y Scooters:Patines',
  'patineta': 'Deportes y Aire Libre:Patines, Skate y Scooters:Skate',
  'skateboard': 'Deportes y Aire Libre:Patines, Skate y Scooters:Skate',
  'scooter': 'Deportes y Aire Libre:Patines, Skate y Scooters:Scooters',
  'casco patin': 'Deportes y Aire Libre:Patines, Skate y Scooters:Proteccion Skate',
  'rodilleras': 'Deportes y Aire Libre:Patines, Skate y Scooters:Proteccion Skate',
};

// Helper to normalize text
function normalize(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, ""); // Remove special chars
}

export function detectCategory(title: string): CategoryMatch | null {
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(/\s+/);
  
  // 1. Detect Gender
  let detectedGender: string | null = null;
  for (const word of words) {
    if (GENDER_KEYWORDS[word]) {
      detectedGender = GENDER_KEYWORDS[word];
      break;
    }
  }
  
  // 2. Detect Concept
  let detectedConcept: string | null = null;
  let maxLen = 0;
  
  // Check multi-word phrases first? For simplicity, check single keywords or bigrams if needed.
  // We'll iterate over keys to find matches in title
  for (const [key, concept] of Object.entries(KEYWORD_CONCEPTS)) {
    if (normalizedTitle.includes(key)) {
      // Prefer longer matches (e.g. "camino de mesa" vs "camino") - though keys are single words mostly
      if (key.length > maxLen) {
        detectedConcept = concept;
        maxLen = key.length;
      }
    }
  }
  
  if (!detectedConcept) return null;
  
  // 3. Resolve to specific Category ID based on Gender
  // If no gender detected, default to Mujeres or most likely?
  // Or return null gender and let UI prompt user?
  // We'll default to Mujeres if ambiguous for clothing, unless concept implies Home.
  
  let finalGender = detectedGender;
  
  if (detectedConcept.startsWith('Hogar:')) {
    finalGender = 'Hogar';
    const parts = detectedConcept.split(':');
    return {
      gender: 'Hogar',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.9
    };
  }

  if (detectedConcept.startsWith('Alimentos y Bebidas:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Alimentos y Bebidas',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Otros:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Otros',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Deportes y Aire Libre:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Deportes y Aire Libre',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Automotriz y Motocicletas:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Automotriz y Motocicletas',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }
  
  if (detectedConcept.startsWith('Electrónica y Tecnología:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Electrónica y Tecnología',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Belleza y Salud:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Belleza y Salud',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }
  
  if (detectedConcept.startsWith('Software y Licencias:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Software y Licencias',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  // Handle Accesorios special case
  if (detectedConcept.startsWith('Accesorios:')) {
    const parts = detectedConcept.split(':');
    // If gender not specified, default to Mujer but confidence lower?
    // Actually, Accessories exist in all genders.
    return {
      gender: finalGender || 'Mujer', // Default
      category: 'Accesorios',
      subcategory: parts[1],
      confidence: finalGender ? 0.9 : 0.6
    };
  }
  
  if (!finalGender) {
    // Infer gender from concept if possible?
    if (['Vestidos', 'Faldas', 'Blusas', 'Lenceria', 'Tops y Bodies'].includes(detectedConcept)) {
      finalGender = 'Mujer';
    } else if (['Camisas', 'Trajes'].includes(detectedConcept)) {
      finalGender = 'Hombre';
    } else {
      finalGender = 'Mujer'; // Fallback
    }
  }
  
  // Map concept to exact category label in config
  const categories = NEW_CATEGORIES_CONFIG[finalGender];
  if (!categories) return null;
  
  let matchedCategory: Category | undefined;
  let matchedSubcategory: SubCategory | undefined;
  
  // 1. Search for Subcategory match first (Specific)
  for (const cat of categories) {
    const sub = cat.subcategories.find(s => normalize(s.label) === normalize(detectedConcept!) || normalize(s.id) === normalize(detectedConcept!));
    if (sub) {
      matchedCategory = cat;
      matchedSubcategory = sub;
      break;
    }
  }

  // 2. If not found, search for Category match (Generic)
  if (!matchedCategory) {
    matchedCategory = categories.find(c => normalize(c.label) === normalize(detectedConcept!) || normalize(c.id) === normalize(detectedConcept!));
  }
  
  // If not found, try fuzzy match or specific mappings
  if (!matchedCategory) {
    // Handle "Sueter" mapping
    if (detectedConcept === 'Sueter') {
      if (finalGender === 'Mujer') matchedCategory = categories.find(c => c.label === 'Ropa'); // Sueter is in Ropa
      else matchedCategory = categories.find(c => c.label === 'Ropa');
    }
    // Handle "Chamarras" mapping
    else if (detectedConcept === 'Chamarras') {
       matchedCategory = categories.find(c => c.label === 'Ropa');
    }
  }
  
  // Fallback: search for partial label match
  if (!matchedCategory) {
     matchedCategory = categories.find(c => normalize(c.label).includes(normalize(detectedConcept!)));
  }
  
  if (matchedCategory) {
    return {
      gender: finalGender,
      category: matchedCategory.label,
      subcategory: matchedSubcategory ? matchedSubcategory.label : null,
      confidence: matchedSubcategory ? 0.9 : 0.8
    };
  }
  
  return null;
}
