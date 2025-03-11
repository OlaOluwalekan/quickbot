'use server'

import axios from 'axios'
import { headers } from 'next/headers'

export const getLocation = async () => {
  const headersList = await headers()

  const ip = headersList.get('x-forwarder-for') || '8.8.8.8'

  const { data } = await axios.get(`http://ip-api.com/json/${ip}`)
  const country = data.country

  const countriesData = await getCountiesData()

  const countryData = countriesData.locations.find(
    (data: any) => data.name === country
  )
  const countryId = countryData.placeID

  return countryId
}

const getCountiesData = async () => {
  const options = {
    method: 'GET',
    url: 'https://twitter-trends-by-location.p.rapidapi.com/locations',
    headers: {
      'x-rapidapi-key': 'b3c7b71d15msh4966d113aace904p1ca73bjsn8d3ee2075fef',
      'x-rapidapi-host': 'twitter-trends-by-location.p.rapidapi.com',
    },
  }

  try {
    const { data } = await axios.request(options)
    return data
  } catch (error) {
    console.error(error)
    return null
  }
}

export const getTrendingTopics = async () => {
  const locationId = await getLocation()

  const options = {
    method: 'GET',
    url: `https://twitter-trends-by-location.p.rapidapi.com/location/${locationId}`,
    headers: {
      'x-rapidapi-key': 'b3c7b71d15msh4966d113aace904p1ca73bjsn8d3ee2075fef',
      'x-rapidapi-host': 'twitter-trends-by-location.p.rapidapi.com',
    },
  }

  try {
    const { data } = await axios.request(options)
    return data
  } catch (error) {
    console.error(error)
    return null
  }
}
