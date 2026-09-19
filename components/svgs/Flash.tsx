'use client'

import clsx from 'clsx'

const Flash = ({ animate }: { animate: boolean }) => {
  return (
    <div className='inline-flex'>
      <svg
        width={48}
        height={48}
        viewBox='0 0 48 48'
        xmlns='http://www.w3.org/2000/svg'
      >
        <defs>
          <style>
            {`
                    .flash {
                        stroke-dasharray: 150;
                        stroke-dashoffset: 150;
                        animation: draw 1s ease-in-out infinite;
                    }

                    @keyframes draw {
                        to {
                            stroke-dashoffset: 0;
                        }
                    }
                `}
          </style>
        </defs>
        <path
          className={clsx(animate && 'flash')}
          d='M 17.977924,6.8111813 H 33.799439 L 24.726432,20.338818 H 37.776914 L 17.71487,40.047309 21.480543,25.993624 9.7578068,25.905236 Z'
          id='path1'
          stroke='#33d205'
          fill='transparent'
          strokeWidth={3}
        />
      </svg>
    </div>
  )
}

export default Flash
